-- =====================================================================
-- Cerrar la cuenta de una mesa (último paso del circuito del salón).
--
-- Va en una función, no en un update desde la Server Action, por una
-- carrera concreta: si un mozo confirma una ronda en el mismo instante en
-- que otro cierra la mesa, la cuenta podía quedar cerrada con ítems sin
-- entregar. Acá se bloquea la fila de la cuenta (`for update`), se cuentan
-- los pendientes y se cierra, todo en la misma transacción.
-- crear_pedido_mozo toma el mismo bloqueo (más abajo), así que las dos se
-- ordenan: o la ronda entra primero y el cierre la ve como pendiente, o el
-- cierre va primero y la ronda falla con "no tiene una cuenta abierta".
-- =====================================================================

create or replace function cerrar_cuenta(
  p_cuenta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta         cuentas%rowtype;
  v_pendiente      int;
  v_en_preparacion int;
  v_listo          int;
begin
  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'No se encontró la cuenta';
  end if;

  if not tiene_rol(v_cuenta.comercio_id, '{duenio,mozo}') then
    raise exception 'No autorizado';
  end if;

  if v_cuenta.estado <> 'abierta' then
    raise exception 'Esa mesa ya está cerrada';
  end if;

  -- Lo de pedidos cancelados no cuenta: no se va a entregar nunca.
  select count(*) filter (where i.estado = 'pendiente'),
         count(*) filter (where i.estado = 'en_preparacion'),
         count(*) filter (where i.estado = 'listo')
    into v_pendiente, v_en_preparacion, v_listo
    from pedido_items i
    join pedidos p on p.id = i.pedido_id
   where p.cuenta_id = p_cuenta_id
     and p.estado <> 'cancelado'
     and i.estado <> 'entregado';

  if v_pendiente + v_en_preparacion + v_listo > 0 then
    return jsonb_build_object(
      'ok', false,
      'pendiente', v_pendiente,
      'en_preparacion', v_en_preparacion,
      'listo', v_listo
    );
  end if;

  update cuentas
     set estado = 'cerrada', cerrada_en = now()
   where id = p_cuenta_id;

  return jsonb_build_object('ok', true, 'pendiente', 0, 'en_preparacion', 0, 'listo', 0);
end;
$$;

revoke execute on function cerrar_cuenta(uuid) from public, anon;
grant execute on function cerrar_cuenta(uuid) to authenticated;

-- crear_pedido_mozo: único cambio, `for update` al leer la cuenta (ver
-- arriba). El resto es igual a la versión de
-- 20261009032426_copiar_categoria_en_pedido_items.sql.
create or replace function crear_pedido_mozo(
  p_cuenta_id uuid,
  p_items     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta  cuentas%rowtype;
  v_pedido  pedidos%rowtype;
  v_item    jsonb;
  v_prod    record;
  v_nombre  text;
  v_item_id uuid;
begin
  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found or v_cuenta.estado <> 'abierta' then
    raise exception 'Esa mesa no tiene una cuenta abierta';
  end if;

  if not tiene_rol(v_cuenta.comercio_id, '{duenio,mozo}') then
    raise exception 'No autorizado';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  -- `pedidos.numero`/`jornada` los asigna el trigger `pedido_numero`
  -- (asignar_numero_pedido) — no se calculan acá.
  insert into pedidos (comercio_id, origen, estado, cuenta_id, creado_por)
  values (v_cuenta.comercio_id, 'mozo', 'confirmado', p_cuenta_id, auth.uid())
  returning * into v_pedido;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Misma cadena que carta_publica/crear_pedido_landing: producto
    -- activo y con stock, categoría activa, sector efectivo (el propio
    -- del producto si lo pisa, si no el de su categoría) activo.
    select p.id, p.nombre, p.precio, c.nombre as categoria_nombre,
           coalesce(p.sector_id, c.sector_id) as sector_id
      into v_prod
      from productos p
      join categorias c on c.id = p.categoria_id
      join sectores s on s.id = coalesce(p.sector_id, c.sector_id)
     where p.id = (v_item->>'producto_id')::uuid
       and p.comercio_id = v_cuenta.comercio_id
       and p.activo and not p.sin_stock
       and c.activo
       and s.activo;

    if not found then
      -- Se busca el nombre aparte (sin los filtros de arriba) solo para
      -- poder avisar cuál producto fue, no para validar nada con esto.
      select nombre into v_nombre from productos
       where id = (v_item->>'producto_id')::uuid and comercio_id = v_cuenta.comercio_id;
      raise exception 'Ya no está disponible: %', coalesce(v_nombre, 'un producto del pedido');
    end if;

    insert into pedido_items (comercio_id, pedido_id, producto_id, nombre, categoria_nombre, precio_unitario, cantidad, nota, sector_id)
    values (v_cuenta.comercio_id, v_pedido.id, v_prod.id, v_prod.nombre, v_prod.categoria_nombre, v_prod.precio,
            greatest(coalesce((v_item->>'cantidad')::int, 1), 1), nullif(v_item->>'nota', ''), v_prod.sector_id)
    returning id into v_item_id;

    insert into pedido_item_adicionales (comercio_id, item_id, adicional_id, nombre, precio_extra)
    select v_cuenta.comercio_id, v_item_id, a.id, a.nombre, a.precio_extra
      from adicionales a
      join producto_adicionales pa on pa.adicional_id = a.id and pa.producto_id = v_prod.id
     where a.activo
       and a.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_item->'adicionales', '[]')) x);
  end loop;

  return jsonb_build_object('pedido_id', v_pedido.id, 'numero', v_pedido.numero);
end;
$$;

revoke execute on function crear_pedido_mozo(uuid, jsonb) from public, anon;
grant execute on function crear_pedido_mozo(uuid, jsonb) to authenticated;
