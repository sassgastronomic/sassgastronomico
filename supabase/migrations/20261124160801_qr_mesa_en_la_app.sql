-- =====================================================================
-- Lo que la app necesita para usar el QR de mesa (la base del flujo ya
-- está en 20261124152856_pedido_por_qr_de_mesa.sql):
--
--   1. El interruptor lo maneja el DUEÑO, no el admin.
--   2. `carta_publica` dice si el local tiene el QR de mesa prendido, para
--      que /{slug}/mesa pueda mostrar una pantalla clara en vez de dejar
--      al cliente armar un pedido que después no se va a poder crear.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El interruptor, en manos del dueño.
--
-- Por qué una función y no una policy de UPDATE sobre `comercios`: una
-- policy habilita la fila entera, así que `comercios_duenio` le dejaría
-- cambiar con una llamada directa a la API su propio `plan`, su `estado`
-- (salir de "suspendido") y su `limite_usuarios`. Es exactamente el error
-- que se sacó en `productos_stock` (ver docs/SCHEMA.md, "Disponibilidad
-- durante la jornada"): una policy no sabe de columnas.
--
-- Esta función toca una sola columna y nada más.
-- ---------------------------------------------------------------------

create or replace function cambiar_qr_mesa(
  p_comercio_id uuid,
  p_activo      boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plan_comercio;
begin
  if p_activo is null then
    raise exception 'Falta indicar si se prende o se apaga';
  end if;

  -- `tiene_rol` ya exige dueño activo y comercio activo.
  if not tiene_rol(p_comercio_id, '{duenio}') then
    raise exception 'No autorizado';
  end if;

  select plan into v_plan from comercios where id = p_comercio_id;

  -- Prender el QR de mesa sin salón no significa nada: `crear_borrador_qr`
  -- lo rechazaría igual. Se corta acá para poder decirlo con palabras.
  -- Apagarlo se permite siempre: si el local bajó de plan con el
  -- interruptor prendido, tiene que poder dejarlo limpio.
  if p_activo and v_plan not in ('salon', 'completo') then
    raise exception 'Tu plan no incluye salón';
  end if;

  update comercios
     set qr_mesa_activo = p_activo
   where id = p_comercio_id;
end $$;

revoke execute on function cambiar_qr_mesa(uuid, boolean) from public, anon;
grant execute on function cambiar_qr_mesa(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. `carta_publica` suma `qr_mesa_activo`.
--
-- Es la única forma de que la pantalla del cliente lo sepa: `comercios`
-- solo la leen los miembros (`comercios_leer`), así que `anon` no puede
-- consultarla ni para esto.
--
-- Cambio puramente aditivo: la landing de take away ignora el campo nuevo.
-- El resto de la función queda igual que en
-- 20260923012218_corregir_sector_efectivo_en_carta_publica.sql.
-- ---------------------------------------------------------------------

create or replace function carta_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'comercio', jsonb_build_object(
      'nombre', c.nombre,
      'plan', c.plan,
      'whatsapp', c.whatsapp,
      'qr_mesa_activo', c.qr_mesa_activo,
      'tomando_pedidos', exists (
        select 1 from cajas k where k.comercio_id = c.id and k.estado = 'abierta'
      )
    ),
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
$$;

-- Parte de la API pública: la llama la carta sin sesión (la landing y el
-- QR de mesa) y también la vista previa del dueño.
revoke execute on function carta_publica(text) from public;
grant execute on function carta_publica(text) to anon, authenticated;
