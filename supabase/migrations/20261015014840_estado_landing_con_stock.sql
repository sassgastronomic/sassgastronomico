-- La landing abierta ya pregunta cada tanto si el local está tomando
-- pedidos (endpoint cacheado en el CDN, ver docs/SCHEMA.md, "Landing
-- pública"). Ahora, en la misma consulta, también qué productos están sin
-- stock: así un "sin stock" que marca la cocina o el mostrador le llega a
-- la landing sin recargar, sin una consulta más a la base (sigue siendo a
-- lo sumo una cada 30 segundos por local, miren cuantos miren).
--
-- Reemplaza a landing_tomando_pedidos (solo la usaba ese endpoint).
--
-- - tomando_pedidos: lo mismo que carta_publica en
--   comercio.tomando_pedidos (la landing compara las dos).
-- - sin_stock: ids de los productos activos marcados sin stock. Ids que la
--   carta pública ya muestra, con el mismo dato; uno que no esté en la
--   carta (categoría o sector apagados) la landing lo ignora.
--
-- null si el comercio no existe o no está activo (igual que carta_publica).

create or replace function estado_landing (
  p_slug text
)
  returns jsonb
  language sql
  stable
  security definer
  set search_path to 'public'
  as $function$
  select jsonb_build_object(
    'tomando_pedidos', exists (
      select 1 from cajas k where k.comercio_id = c.id and k.estado = 'abierta'
    ),
    'sin_stock', coalesce((
      select jsonb_agg(p.id order by p.id)
        from productos p
       where p.comercio_id = c.id and p.activo and p.sin_stock
    ), '[]'::jsonb)
  )
  from comercios c
  where c.slug = p_slug and c.estado = 'activo';
$function$;

-- Parte de la API pública: la llama la landing, sin sesión.
revoke execute on function estado_landing(text) from public, anon;
grant execute on function estado_landing(text) to anon, authenticated;

drop function if exists landing_tomando_pedidos(text);
