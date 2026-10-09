-- =====================================================================
-- Copia del nombre de la categoría en cada ítem de pedido. Muchos
-- productos se llaman solo por su variante ("Simple", "Completo") y es la
-- categoría la que les da sentido: en la cocina, "1× Simple" puede ser un
-- lomito o una hamburguesa. Se guarda como copia (regla de oro #3 de
-- docs/SCHEMA.md), igual que el nombre y el precio: si mañana se renombra
-- o se mueve la categoría, los pedidos ya hechos no cambian.
-- =====================================================================

alter table pedido_items add column categoria_nombre text;

-- Pedidos ya existentes: se completan con la categoría *actual* de su
-- producto, que es lo mejor que hay (no se guardaba antes). Los ítems
-- sin producto quedan en null y las pantallas simplemente no la muestran.
update pedido_items pi
   set categoria_nombre = c.nombre
  from productos p
  join categorias c on c.id = p.categoria_id
 where p.id = pi.producto_id
   and pi.categoria_nombre is null;

-- Las dos funciones que crean pedidos, sin más cambios que copiar
-- `c.nombre` (la categoría ya estaba en el join para validar
-- disponibilidad).

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

create or replace function crear_pedido_landing (
  p_slug             text,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_modalidad        public.modalidad_pedido,
  p_direccion        text,
  p_nota             text,
  p_items            jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_comercio comercios%rowtype;
  v_pedido   pedidos%rowtype;
  v_item     jsonb;
  v_prod     record;
  v_item_id  uuid;
begin
  select * into v_comercio from comercios where slug = p_slug;
  if not found or v_comercio.estado <> 'activo' or v_comercio.plan = 'salon' then
    raise exception 'Este local no está tomando pedidos online';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  insert into pedidos (comercio_id, origen, estado, cliente_nombre, cliente_telefono, modalidad, direccion, nota)
  values (v_comercio.id, 'landing', 'pendiente_confirmar', p_cliente_nombre, p_cliente_telefono, p_modalidad, p_direccion, p_nota)
  returning * into v_pedido;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Exige toda la cadena activa (producto, categoría, sector efectivo),
    -- igual que carta_publica.
    select p.id, p.nombre, p.precio, c.nombre as categoria_nombre,
           coalesce(p.sector_id, c.sector_id) as sector_id
      into v_prod
      from productos p
      join categorias c on c.id = p.categoria_id
      join sectores s on s.id = coalesce(p.sector_id, c.sector_id)
     where p.id = (v_item->>'producto_id')::uuid
       and p.comercio_id = v_comercio.id
       and p.activo and not p.sin_stock
       and c.activo
       and s.activo;
    if not found then
      raise exception 'Un producto del pedido no está disponible';
    end if;

    insert into pedido_items (comercio_id, pedido_id, producto_id, nombre, categoria_nombre, precio_unitario, cantidad, nota, sector_id)
    values (v_comercio.id, v_pedido.id, v_prod.id, v_prod.nombre, v_prod.categoria_nombre, v_prod.precio,
            greatest(coalesce((v_item->>'cantidad')::int, 1), 1), v_item->>'nota', v_prod.sector_id)
    returning id into v_item_id;

    insert into pedido_item_adicionales (comercio_id, item_id, adicional_id, nombre, precio_extra)
    select v_comercio.id, v_item_id, a.id, a.nombre, a.precio_extra
      from adicionales a
      join producto_adicionales pa on pa.adicional_id = a.id and pa.producto_id = v_prod.id
     where a.activo
       and a.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_item->'adicionales', '[]')) x);
  end loop;

  return jsonb_build_object('pedido_id', v_pedido.id, 'numero', v_pedido.numero);
end $function$;

-- Mismas firmas que antes: CREATE OR REPLACE preserva los grants, pero se
-- reafirman explícitos (regla de "Funciones nuevas" en docs/SCHEMA.md).
revoke execute on function crear_pedido_mozo(uuid, jsonb) from public, anon;
grant execute on function crear_pedido_mozo(uuid, jsonb) to authenticated;

revoke execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) from public, anon;
grant execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) to anon, authenticated, postgres, service_role;
