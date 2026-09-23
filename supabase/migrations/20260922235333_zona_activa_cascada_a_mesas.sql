-- =====================================================================
-- Desactivar o reactivar una zona ahora arrastra a sus mesas: al
-- desactivar la zona, todas sus mesas pasan a inactivas; al reactivarla,
-- todas vuelven a activas (sin importar si alguna estaba desactivada
-- aparte) — ver src/app/app/mesas/zonas/[id]/actions.ts. El update de
-- `zonas` y el de `mesas` van en una sola función para que queden en la
-- misma transacción: dos updates sueltos desde la Server Action podrían
-- dejarlos desincronizados si el segundo falla.
-- =====================================================================
create or replace function actualizar_zona_con_mesas(
  p_id     uuid,
  p_nombre text,
  p_activo boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_comercio_id     uuid;
  v_activo_anterior boolean;
begin
  select comercio_id, activo into v_comercio_id, v_activo_anterior
  from zonas where id = p_id;

  if not found then
    raise exception 'Zona no encontrada';
  end if;

  if not tiene_rol(v_comercio_id, '{duenio}') then
    raise exception 'No autorizado';
  end if;

  update zonas set nombre = p_nombre, activo = p_activo where id = p_id;

  -- Solo arrastra a las mesas si el estado de la zona realmente cambió:
  -- guardar el nombre sin tocar el estado no debe reactivar ni desactivar
  -- mesas que el dueño haya marcado aparte.
  if v_activo_anterior is distinct from p_activo then
    update mesas set activo = p_activo
    where zona_id = p_id and comercio_id = v_comercio_id;
  end if;
end;
$$;

revoke execute on function actualizar_zona_con_mesas(uuid, text, boolean) from public, anon;

grant execute on function actualizar_zona_con_mesas(uuid, text, boolean) to authenticated;
