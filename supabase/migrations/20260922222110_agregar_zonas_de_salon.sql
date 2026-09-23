-- =====================================================================
-- Zonas del salón (Salón, Terraza, Vereda...). Se llama "zona" y no
-- "sección" a propósito, para no confundirse con "sector" (cocina, barra):
-- son dos conceptos distintos que ya conviven en el proyecto — ver
-- docs/SCHEMA.md.
-- =====================================================================

create table zonas (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  nombre       text not null,
  orden        int  not null default 0,
  activo       boolean not null default true
);
create index on zonas (comercio_id);

alter table zonas enable row level security;

-- Mismo patrón que sectores/categorias/productos/adicionales/mesas: admins
-- todo, miembros leen, dueño escribe.
create policy zonas_admin on zonas for all
  using (es_admin())
  with check (es_admin());

create policy zonas_leer on zonas for select
  using (es_miembro(comercio_id));

create policy zonas_duenio on zonas for all
  using (tiene_rol(comercio_id, '{duenio}'))
  with check (tiene_rol(comercio_id, '{duenio}'));

-- ---------------------------------------------------------------------
-- Una mesa pertenece a una zona.
-- ---------------------------------------------------------------------

-- Nullable durante la migración de datos de abajo; se pone NOT NULL al
-- final de este archivo, una vez que ninguna mesa existente quede sin
-- zona asignada.
alter table mesas add column zona_id uuid references zonas(id);

-- Migración de datos: una zona "Salón" por cada comercio que ya tenga al
-- menos una mesa, con todas sus mesas actuales asignadas a ella — nadie
-- pierde nada. Un comercio sin mesas hoy no recibe una zona acá (no hay
-- nada que migrarle): cuando el dueño entre a /app/mesas/zonas va a poder
-- crear la suya, igual que crea cualquier otra zona nueva.
insert into zonas (comercio_id, nombre, orden)
select distinct comercio_id, 'Salón', 0
from mesas;

update mesas m
set zona_id = z.id
from zonas z
where z.comercio_id = m.comercio_id and z.nombre = 'Salón';

alter table mesas alter column zona_id set not null;
create index on mesas (comercio_id, zona_id);

-- ---------------------------------------------------------------------
-- Todo comercio nuevo nace con la zona "Salón", igual que nace con el
-- sector "Cocina" (crear_sector_por_defecto). Mismo motivo para no ser
-- security definer: quien inserta en `comercios` siempre es un admin, y
-- `zonas_admin` ya le permite escribir en `zonas` con sus propios
-- privilegios — no hace falta pedir prestados los del dueño de la función.
-- ---------------------------------------------------------------------
create or replace function crear_zona_por_defecto()
returns trigger language plpgsql as $$
begin
  insert into zonas (comercio_id, nombre, orden) values (new.id, 'Salón', 0);
  return new;
end $$;

-- Solo la dispara el trigger al crear un comercio: nadie la llama directo.
revoke execute on function crear_zona_por_defecto() from public, anon;

create trigger comercio_zona_por_defecto
  after insert on comercios
  for each row execute function crear_zona_por_defecto();
