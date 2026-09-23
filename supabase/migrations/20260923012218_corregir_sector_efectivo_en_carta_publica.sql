-- =====================================================================
-- Ninguna de las dos funciones miraba el sector: una categoría o un
-- producto podían seguir viéndose (y pidiéndose) en la carta pública con
-- su sector apagado. Criterio único, sin cascada automática: cada
-- función calcula la disponibilidad real mirando toda la cadena, en vez
-- de escribir `activo = false` en nada (ver docs/SCHEMA.md).
--
-- "Sector efectivo" de un producto: `coalesce(producto.sector_id, categoria.sector_id)`
-- — un producto puede, en teoría, pisar el sector de su categoría (columna
-- que la interfaz no expone todavía, ver docs/SCHEMA.md). Una categoría no
-- tiene sector "efectivo" propio: siempre es el suyo (`categoria.sector_id`,
-- obligatorio).
-- =====================================================================

create or replace function carta_publica (
  p_slug text
)
  returns jsonb
  language sql
  stable
  security definer
  set search_path to 'public'
  as $function$
  select jsonb_build_object(
    'comercio', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'plan', c.plan),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cat.id, 'nombre', cat.nombre,
        'productos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'nombre', p.nombre, 'descripcion', p.descripcion,
            'precio', p.precio, 'imagen_url', p.imagen_url, 'sin_stock', p.sin_stock,
            'adicionales', coalesce((
              select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'precio_extra', a.precio_extra))
              from producto_adicionales pa join adicionales a on a.id = pa.adicional_id
              where pa.producto_id = p.id and a.activo
            ), '[]'::jsonb)
          ) order by p.orden)
          from productos p
          join sectores sp on sp.id = coalesce(p.sector_id, cat.sector_id)
          where p.categoria_id = cat.id and p.activo and sp.activo
        ), '[]'::jsonb)
      ) order by cat.orden)
      from categorias cat
      join sectores scat on scat.id = cat.sector_id
      where cat.comercio_id = c.id and cat.activo and scat.activo
    ), '[]'::jsonb)
  )
  from comercios c
  where c.slug = p_slug and c.estado = 'activo';
$function$;

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
    -- Antes solo validaba `p.activo and not p.sin_stock`: un producto con
    -- la categoría o el sector (propio o heredado) apagados igual se
    -- aceptaba. Ahora exige toda la cadena activa, igual que carta_publica.
    select p.id, p.nombre, p.precio, coalesce(p.sector_id, c.sector_id) as sector_id
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

    insert into pedido_items (comercio_id, pedido_id, producto_id, nombre, precio_unitario, cantidad, nota, sector_id)
    values (v_comercio.id, v_pedido.id, v_prod.id, v_prod.nombre, v_prod.precio,
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

-- Mismas firmas que antes: CREATE OR REPLACE preserva los grants
-- existentes, pero se reafirman explícitos igual (regla de "Funciones
-- nuevas" en docs/SCHEMA.md) para que este archivo sea autocontenido.
revoke execute on function carta_publica(text) from public, anon;
grant execute on function carta_publica(text) to anon, authenticated, postgres, service_role;

revoke execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) from public, anon;
grant execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) to anon, authenticated, postgres, service_role;
