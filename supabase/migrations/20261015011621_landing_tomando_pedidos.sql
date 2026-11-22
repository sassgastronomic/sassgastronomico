-- La landing abierta pregunta cada tanto si el local ya está tomando
-- pedidos (caja abierta), para habilitarse sola sin que el cliente recargue
-- (ver docs/SCHEMA.md, "Landing pública"). Lo pregunta por un endpoint
-- cacheado en el CDN, así que esto corre a lo sumo una vez cada tantos
-- segundos por local, no una vez por cliente.
--
-- Dice exactamente lo mismo que `carta_publica` en
-- `comercio.tomando_pedidos`, pero sin armar la carta: si una cambia, la
-- otra también (la landing compara las dos).
--
-- null si el comercio no existe o no está activo (igual que carta_publica:
-- no distingue un caso del otro).

create or replace function landing_tomando_pedidos (
  p_slug text
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  as $function$
  select exists (
    select 1 from cajas k where k.comercio_id = c.id and k.estado = 'abierta'
  )
  from comercios c
  where c.slug = p_slug and c.estado = 'activo';
$function$;

-- Parte de la API pública: la llama la landing, sin sesión.
revoke execute on function landing_tomando_pedidos(text) from public, anon;
grant execute on function landing_tomando_pedidos(text) to anon, authenticated;
