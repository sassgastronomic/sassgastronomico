-- =====================================================================
-- Ronda de pedido cargada por el mozo desde /app/salon/[id]. Mismo motivo
-- que crear_pedido_landing para ser una sola función en vez de varios
-- inserts sueltos desde la Server Action: todo tiene que quedar en una
-- sola transacción (si un producto dejó de estar disponible a mitad de
-- camino, no puede quedar un pedido a medias), y la disponibilidad se
-- revalida acá adentro con el mismo criterio que carta_publica — sector
-- efectivo incluido — no una copia relajada de esa regla.
-- =====================================================================

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
  select * into v_cuenta from cuentas where id = p_cuenta_id;
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
    select p.id, p.nombre, p.precio, coalesce(p.sector_id, c.sector_id) as sector_id
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

    insert into pedido_items (comercio_id, pedido_id, producto_id, nombre, precio_unitario, cantidad, nota, sector_id)
    values (v_cuenta.comercio_id, v_pedido.id, v_prod.id, v_prod.nombre, v_prod.precio,
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
