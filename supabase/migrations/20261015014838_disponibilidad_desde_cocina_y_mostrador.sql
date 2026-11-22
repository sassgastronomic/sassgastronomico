-- Disponibilidad durante la jornada: marcar un producto "sin stock" (o
-- volver a tenerlo) desde la pantalla del sector o del mostrador, sin
-- entrar como dueño (ver docs/SCHEMA.md, "Disponibilidad durante la
-- jornada").
--
-- Quién puede:
-- - dueño y mostrador: cualquier producto del comercio;
-- - sector: solo los productos de los sectores que tiene asignados
--   (miembro_sectores), mirando el sector efectivo del producto
--   (coalesce(productos.sector_id, categorias.sector_id)).
--
-- Solo cambia `sin_stock`, nunca `activo` ni ninguna otra columna: eso
-- sigue siendo del dueño (su ABM, policy productos_duenio).
--
-- Por qué una función y no una policy: una policy de UPDATE habilita la
-- fila entera, no una columna. La que había para el mostrador
-- (productos_stock) le dejaba cambiar, con una llamada directa a la API,
-- el precio, el nombre o el `activo` de cualquier producto. Se reemplaza
-- por esta función, que valida el rol adentro y toca una sola columna.

create or replace function cambiar_stock_producto (
  p_producto_id uuid,
  p_sin_stock   boolean
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_comercio_id uuid;
  v_sector_id   uuid;
begin
  if p_sin_stock is null then
    raise exception 'Falta indicar si el producto tiene stock';
  end if;

  select p.comercio_id, coalesce(p.sector_id, c.sector_id)
    into v_comercio_id, v_sector_id
    from productos p
    join categorias c on c.id = p.categoria_id
   where p.id = p_producto_id;

  -- Mismo mensaje si no existe que si es de otro comercio: no confirma
  -- qué ids existen.
  if not found or not (
    tiene_rol(v_comercio_id, array['duenio', 'mostrador']::rol_miembro[])
    or (
      tiene_rol(v_comercio_id, array['sector']::rol_miembro[])
      and exists (
        select 1
          from miembro_sectores ms
          join miembros m on m.id = ms.miembro_id
         where ms.sector_id = v_sector_id
           and m.comercio_id = v_comercio_id
           and m.perfil_id = auth.uid()
           and m.activo
      )
    )
  ) then
    raise exception 'No podés cambiar la disponibilidad de ese producto';
  end if;

  -- Sin cambio, sin escritura: no dispara un evento de Realtime de más en
  -- todas las pantallas.
  update productos
     set sin_stock = p_sin_stock
   where id = p_producto_id
     and sin_stock is distinct from p_sin_stock;
end;
$function$;

revoke execute on function cambiar_stock_producto(uuid, boolean) from public, anon;
grant execute on function cambiar_stock_producto(uuid, boolean) to authenticated;

drop policy if exists "productos_stock" on productos;
