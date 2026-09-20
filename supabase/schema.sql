-- =====================================================================
-- SaaS gastronómico — Esquema Plan 1 (Supabase / Postgres)
-- Ver docs/SCHEMA.md para las decisiones de diseño.
-- Punto de partida: revisar y ajustar antes de producción.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type plan_comercio   as enum ('take_away', 'salon', 'completo');
create type estado_comercio as enum ('activo', 'suspendido');
-- 'cocina' y 'barra' quedan en el enum por limitación de Postgres (no se
-- pueden sacar valores de un enum sin recrear el tipo), pero ya no se usan:
-- los reemplazó 'sector' + la tabla miembro_sectores (qué sector concreto
-- ve cada miembro), ver docs/SCHEMA.md.
create type rol_miembro     as enum ('duenio', 'mostrador', 'mozo', 'cocina', 'barra', 'sector');
create type estado_cuenta   as enum ('abierta', 'cerrada');
create type origen_pedido   as enum ('landing', 'mozo', 'qr_mesa', 'mostrador');
create type estado_pedido   as enum ('pendiente_confirmar', 'confirmado', 'entregado', 'cancelado');
create type modalidad_pedido as enum ('retiro', 'envio');
create type estado_item     as enum ('pendiente', 'en_preparacion', 'listo', 'entregado');

-- ---------------------------------------------------------------------
-- Base (sprint 1)
-- ---------------------------------------------------------------------
create table comercios (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  plan             plan_comercio   not null default 'take_away',
  estado           estado_comercio not null default 'activo',
  limite_usuarios  int  not null default 10 check (limite_usuarios > 0),
  zona_horaria     text not null default 'America/Argentina/Buenos_Aires',
  hora_corte       time not null default '06:00',
  creado_en        timestamptz not null default now()
);

create table perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  email      text,
  -- Nombre de usuario para el personal sin email real (mostrador/mozo/
  -- sector, ver docs/SCHEMA.md "Identificación del personal"). Null para el
  -- dueño y para los admins: ellos entran con email. Único en todo el
  -- sistema (no por comercio): dos comercios no pueden tener "juan" los dos.
  usuario    text unique check (usuario ~ '^[a-z0-9._]{3,30}$'),
  es_admin   boolean not null default false,
  creado_en  timestamptz not null default now()
);

create table miembros (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  perfil_id    uuid not null references perfiles(id)  on delete cascade,
  rol          rol_miembro not null,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  unique (comercio_id, perfil_id)
);
create index on miembros (perfil_id);

-- Crear perfil automáticamente al registrarse un usuario en Auth. `usuario`
-- sale de `raw_user_meta_data` igual que `nombre`: lo manda la app solo para
-- el personal sin email real (ver src/lib/usuarios/email-interno.ts); para
-- el dueño y los admins no viaja, así que queda null.
create or replace function crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, email, nombre, usuario)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    new.raw_user_meta_data->>'usuario'
  );
  return new;
end $$;

-- Solo la dispara el trigger al crear un usuario en auth.users (GoTrue):
-- nadie la llama directo, revoke sin grant (ver "Funciones nuevas" en
-- docs/SCHEMA.md). Disparar un trigger no requiere EXECUTE aparte: el
-- revoke de PUBLIC no rompe el trigger.
revoke execute on function crear_perfil_nuevo_usuario() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------
-- Carta (sprint 2)
-- ---------------------------------------------------------------------
create table sectores (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  nombre       text not null,
  orden        int  not null default 0,
  activo       boolean not null default true
);
create index on sectores (comercio_id);

-- Qué sector concreto ve cada miembro con rol 'sector' (reemplaza el viejo
-- matcheo por nombre de sector, ver docs/SCHEMA.md).
create table miembro_sectores (
  comercio_id  uuid not null references comercios(id) on delete cascade,
  miembro_id   uuid not null references miembros(id)  on delete cascade,
  sector_id    uuid not null references sectores(id)  on delete cascade,
  primary key (miembro_id, sector_id)
);
create index on miembro_sectores (comercio_id);
create index on miembro_sectores (sector_id);

create table categorias (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  nombre       text not null,
  sector_id    uuid not null references sectores(id),
  orden        int  not null default 0,
  activo       boolean not null default true
);
create index on categorias (comercio_id);

create table productos (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   uuid not null references comercios(id) on delete cascade,
  categoria_id  uuid not null references categorias(id),
  nombre        text not null,
  descripcion   text,
  precio        numeric(12,2) not null check (precio >= 0),
  imagen_url    text,
  sector_id     uuid references sectores(id), -- null = usa el de la categoría
  sin_stock     boolean not null default false,
  activo        boolean not null default true,
  orden         int  not null default 0
);
create index on productos (comercio_id, categoria_id);

create table adicionales (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   uuid not null references comercios(id) on delete cascade,
  nombre        text not null,
  precio_extra  numeric(12,2) not null default 0 check (precio_extra >= 0),
  activo        boolean not null default true
);
create index on adicionales (comercio_id);

create table producto_adicionales (
  comercio_id   uuid not null references comercios(id) on delete cascade,
  producto_id   uuid not null references productos(id)   on delete cascade,
  adicional_id  uuid not null references adicionales(id) on delete cascade,
  primary key (producto_id, adicional_id)
);

-- Todo comercio nace con el sector "Cocina"
create or replace function crear_sector_por_defecto()
returns trigger language plpgsql as $$
begin
  insert into sectores (comercio_id, nombre, orden) values (new.id, 'Cocina', 0);
  return new;
end $$;

-- Solo la dispara el trigger al crear un comercio: nadie la llama directo.
revoke execute on function crear_sector_por_defecto() from public;

create trigger comercio_sector_por_defecto
  after insert on comercios
  for each row execute function crear_sector_por_defecto();

-- ---------------------------------------------------------------------
-- Salón y pedidos (sprints 3 a 6)
-- ---------------------------------------------------------------------
create table mesas (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  nombre       text not null,
  orden        int  not null default 0,
  activo       boolean not null default true
);
create index on mesas (comercio_id);

create table cuentas (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  mesa_id      uuid not null references mesas(id),
  mozo_id      uuid references perfiles(id),
  estado       estado_cuenta not null default 'abierta',
  abierta_en   timestamptz not null default now(),
  cerrada_en   timestamptz
);
-- Solo una cuenta abierta por mesa
create unique index cuenta_abierta_unica on cuentas (mesa_id) where estado = 'abierta';
create index on cuentas (comercio_id, estado);

create table pedidos (
  id                  uuid primary key default gen_random_uuid(),
  comercio_id         uuid not null references comercios(id) on delete cascade,
  jornada             date,  -- la completa el trigger
  numero              int,   -- la completa el trigger
  origen              origen_pedido not null,
  cuenta_id           uuid references cuentas(id),
  estado              estado_pedido not null default 'confirmado',
  cliente_nombre      text,
  cliente_telefono    text,
  modalidad           modalidad_pedido,
  direccion           text,
  nota                text,
  creado_por          uuid references perfiles(id),
  creado_en           timestamptz not null default now(),
  confirmado_en       timestamptz,
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  unique (comercio_id, jornada, numero),
  -- take away: sin cuenta y con datos del cliente; salón: con cuenta
  check (
    (cuenta_id is null and cliente_nombre is not null and modalidad is not null)
    or (cuenta_id is not null)
  ),
  check (modalidad is distinct from 'envio' or direccion is not null)
);
create index on pedidos (comercio_id, estado);
create index on pedidos (cuenta_id);

create table pedido_items (
  id               uuid primary key default gen_random_uuid(),
  comercio_id      uuid not null references comercios(id) on delete cascade,
  pedido_id        uuid not null references pedidos(id) on delete cascade,
  producto_id      uuid references productos(id),
  nombre           text not null,                -- copia
  precio_unitario  numeric(12,2) not null,       -- copia
  cantidad         int not null check (cantidad > 0),
  nota             text,
  sector_id        uuid not null references sectores(id), -- copia
  estado           estado_item not null default 'pendiente',
  listo_en         timestamptz,
  entregado_en     timestamptz
);
create index on pedido_items (comercio_id, sector_id, estado);
create index on pedido_items (pedido_id);

create table pedido_item_adicionales (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   uuid not null references comercios(id) on delete cascade,
  item_id       uuid not null references pedido_items(id) on delete cascade,
  adicional_id  uuid references adicionales(id),
  nombre        text not null,           -- copia
  precio_extra  numeric(12,2) not null   -- copia
);
create index on pedido_item_adicionales (item_id);

-- ---------------------------------------------------------------------
-- Numeración por jornada
-- ---------------------------------------------------------------------
create table contadores_pedidos (
  comercio_id  uuid not null references comercios(id) on delete cascade,
  jornada      date not null,
  ultimo       int  not null default 0,
  primary key (comercio_id, jornada)
);

create or replace function jornada_actual(p_comercio uuid)
returns date language sql stable as $$
  select ((now() at time zone c.zona_horaria) - c.hora_corte)::date
  from comercios c where c.id = p_comercio;
$$;

-- Helper interno de asignar_numero_pedido (abajo, security definer: la
-- llama con sus propios privilegios, no con los de quien insertó el
-- pedido). Nadie más la llama directo hoy; si el día de mañana hace falta
-- mostrar la jornada actual desde la app, agregar el grant ahí.
revoke execute on function jornada_actual(uuid) from public;

create or replace function asignar_numero_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.jornada := jornada_actual(new.comercio_id);
  insert into contadores_pedidos (comercio_id, jornada, ultimo)
  values (new.comercio_id, new.jornada, 1)
  on conflict (comercio_id, jornada)
  do update set ultimo = contadores_pedidos.ultimo + 1
  returning ultimo into new.numero;
  return new;
end $$;

-- Solo la dispara el trigger al insertar un pedido: nadie la llama directo.
revoke execute on function asignar_numero_pedido() from public;

create trigger pedido_numero
  before insert on pedidos
  for each row execute function asignar_numero_pedido();

-- ---------------------------------------------------------------------
-- Pedido entregado cuando todos sus ítems lo están
-- ---------------------------------------------------------------------
create or replace function cerrar_pedido_si_completo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'entregado' and not exists (
    select 1 from pedido_items
    where pedido_id = new.pedido_id and estado <> 'entregado'
  ) then
    update pedidos set estado = 'entregado'
    where id = new.pedido_id and estado = 'confirmado';
  end if;
  return new;
end $$;

-- Solo la dispara el trigger al actualizar un ítem: nadie la llama directo.
revoke execute on function cerrar_pedido_si_completo() from public;

create trigger item_entregado
  after update of estado on pedido_items
  for each row execute function cerrar_pedido_si_completo();

-- ---------------------------------------------------------------------
-- Helpers de permisos (usados por RLS)
-- ---------------------------------------------------------------------
create or replace function es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false);
$$;

-- La referencian directo varias policies RLS (comercios_admin, miembros_admin
-- y las "_admin" generadas en los loops de más abajo): authenticated la
-- necesita para poder evaluarlas al consultar esas tablas. anon nunca
-- consulta esas tablas directo en esta app (siempre por carta_publica /
-- crear_pedido_landing, más abajo), así que no la necesita.
revoke execute on function es_admin() from public;
grant execute on function es_admin() to authenticated;

create or replace function plan_permite_rol(p_plan plan_comercio, p_rol rol_miembro)
returns boolean language sql immutable as $$
  select case
    when p_rol = 'mozo' then p_plan in ('salon', 'completo')
    else true
  end;
$$;

-- Solo la llaman tiene_rol y usuarios_ocupados (ambas security definer) por
-- dentro de su propio cuerpo — corren con los privilegios de esas
-- funciones, no con los de quien las invocó. Ninguna policy ni la app la
-- llaman directo, así que no necesita grant a ningún rol externo.
revoke execute on function plan_permite_rol(plan_comercio, rol_miembro) from public;

-- ¿El usuario actual es miembro activo, del comercio activo, con un rol que su plan permite?
create or replace function tiene_rol(p_comercio uuid, p_roles rol_miembro[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from miembros m
    join comercios c on c.id = m.comercio_id
    where m.comercio_id = p_comercio
      and m.perfil_id   = auth.uid()
      and m.activo
      and c.estado = 'activo'
      and m.rol = any (p_roles)
      and plan_permite_rol(c.plan, m.rol)
  );
$$;

-- La referencian directo varias policies RLS (miembros_duenio, items_sector,
-- las "_duenio" generadas en los loops de más abajo, y el cuerpo de
-- actualizar_nombre_miembro): authenticated la necesita para evaluarlas.
revoke execute on function tiene_rol(uuid, rol_miembro[]) from public;
grant execute on function tiene_rol(uuid, rol_miembro[]) to authenticated;

create or replace function es_miembro(p_comercio uuid)
returns boolean language sql stable as $$
  select tiene_rol(p_comercio, enum_range(null::rol_miembro));
$$;

-- La referencian directo las policies "_leer" generadas en los loops de más
-- abajo (sectores_leer, categorias_leer, etc.) y cuentas_leer/pedidos_leer.
revoke execute on function es_miembro(uuid) from public;
grant execute on function es_miembro(uuid) to authenticated;

-- Usuarios que cuentan para el límite: activos y con rol permitido por el plan
create or replace function usuarios_ocupados(p_comercio uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from miembros m join comercios c on c.id = m.comercio_id
  where m.comercio_id = p_comercio and m.activo and plan_permite_rol(c.plan, m.rol);
$$;

-- Postgres otorga EXECUTE a PUBLIC por defecto al crear una función; revocarlo
-- solo de anon/authenticated no alcanza, el permiso sigue viniendo de PUBLIC
-- (ver "Funciones nuevas" en docs/SCHEMA.md). La llama directo la app (uso
-- del límite en /app/usuarios y /admin, ver src/lib/miembros/plan.ts): sin
-- anon, no es parte de la API pública.
revoke execute on function usuarios_ocupados(uuid) from public;
grant execute on function usuarios_ocupados(uuid) to authenticated;

-- Actualiza el nombre (columna `nombre` de `perfiles`) de un miembro del
-- propio comercio. Existe porque `perfiles` no tiene una policy de UPDATE
-- para "soy dueño de un comercio donde esta persona es miembro" — esa tabla
-- es sensible (tiene `es_admin`), así que en vez de abrir una policy nueva
-- ahí, la validación de "sos dueño de su comercio" vive acá adentro y la
-- función solo puede tocar `nombre`.
create or replace function actualizar_nombre_miembro(p_miembro_id uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_comercio_id uuid;
  v_perfil_id   uuid;
begin
  select comercio_id, perfil_id into v_comercio_id, v_perfil_id
  from miembros where id = p_miembro_id;

  if not found then
    raise exception 'Miembro no encontrado';
  end if;

  if not tiene_rol(v_comercio_id, '{duenio}') then
    raise exception 'No autorizado';
  end if;

  -- Un admin del sistema (perfiles.es_admin) puede, en teoría, ser también
  -- miembro de un comercio (nada en el esquema lo impide). Sin este chequeo,
  -- el dueño de ESE comercio podría renombrarlo igual que a cualquier otro
  -- miembro suyo: los admins no son "de un comercio" (ver docs/SCHEMA.md,
  -- "Roles"), así que quedan fuera de esta función sin excepción.
  if exists (select 1 from perfiles where id = v_perfil_id and es_admin) then
    raise exception 'No autorizado';
  end if;

  if trim(coalesce(p_nombre, '')) = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;

  update perfiles set nombre = trim(p_nombre) where id = v_perfil_id;
end $$;

-- Sin anon: no es parte de la API pública, solo la llama la app logueada
-- (ver "Funciones nuevas" en docs/SCHEMA.md sobre por qué el revoke de
-- PUBLIC es explícito y no alcanza con no otorgar a anon).
revoke execute on function actualizar_nombre_miembro(uuid, text) from public;
grant execute on function actualizar_nombre_miembro(uuid, text) to authenticated;

-- ¿Está libre un nombre de usuario? `perfiles.usuario` es único en TODO el
-- sistema, no por comercio (ver la tabla, más arriba). Security definer
-- porque las policies de `perfiles` acotan lo que un dueño ve a su propio
-- comercio (`perfiles_personal`): sin esto, una consulta común dejaría creer
-- libre un nombre que ya usa el personal de otro comercio.
--
-- Por eso mismo, "a quién se le otorga EXECUTE" no alcanza para protegerla:
-- cualquier `authenticated` (mostrador, mozo, sector — no solo dueños)
-- podría llamarla directo y usarla para enumerar qué nombres de usuario
-- existen en TODO el sistema, de cualquier comercio. El chequeo de adentro
-- acota eso: solo puede preguntar alguien que hoy sea dueño activo de algún
-- comercio (el único caller legítimo, ver ./nuevo/actions.ts). No elimina
-- el todo riesgo — un dueño real podría seguir probando nombres de otros
-- comercios — pero reduce la superficie a cuentas que un admin ya dio de
-- alta a propósito, en vez de cualquier cuenta de personal.
create or replace function usuario_disponible(p_usuario text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from miembros
    where perfil_id = auth.uid() and rol = 'duenio' and activo
  ) then
    raise exception 'No autorizado';
  end if;
  return not exists (select 1 from perfiles where usuario = p_usuario);
end $$;

-- Sin anon: no es parte de la API pública, solo la llama la app logueada.
revoke execute on function usuario_disponible(text) from public, anon;
grant  execute on function usuario_disponible(text) to authenticated;

-- Bloquea altas o reactivaciones por encima del límite
create or replace function validar_limite_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limite int;
begin
  if new.activo and (tg_op = 'INSERT' or not old.activo) then
    select limite_usuarios into v_limite from comercios where id = new.comercio_id;
    if usuarios_ocupados(new.comercio_id) >= v_limite then
      raise exception 'Llegaste al máximo de usuarios de tu plan';
    end if;
  end if;
  return new;
end $$;

-- Solo la dispara el trigger al insertar/reactivar un miembro: nadie la
-- llama directo.
revoke execute on function validar_limite_usuarios() from public;

create trigger miembros_limite
  before insert or update of activo on miembros
  for each row execute function validar_limite_usuarios();

-- Bloquea bajar de plan con cuentas abiertas o pedidos por confirmar
create or replace function validar_cambio_plan()
returns trigger language plpgsql as $$
begin
  if new.plan = 'take_away' and old.plan <> 'take_away'
     and exists (select 1 from cuentas where comercio_id = new.id and estado = 'abierta') then
    raise exception 'Hay mesas abiertas: cerralas antes de cambiar el plan';
  end if;
  if new.plan = 'salon' and old.plan <> 'salon'
     and exists (select 1 from pedidos where comercio_id = new.id and estado = 'pendiente_confirmar') then
    raise exception 'Hay pedidos por confirmar: resolvelos antes de cambiar el plan';
  end if;
  return new;
end $$;

-- Solo la dispara el trigger al cambiar el plan: nadie la llama directo.
revoke execute on function validar_cambio_plan() from public;

create trigger comercios_cambio_plan
  before update of plan on comercios
  for each row execute function validar_cambio_plan();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table comercios               enable row level security;
alter table perfiles                enable row level security;
alter table miembros                enable row level security;
alter table sectores                enable row level security;
alter table miembro_sectores        enable row level security;
alter table categorias              enable row level security;
alter table productos               enable row level security;
alter table adicionales             enable row level security;
alter table producto_adicionales    enable row level security;
alter table mesas                   enable row level security;
alter table cuentas                 enable row level security;
alter table pedidos                 enable row level security;
alter table pedido_items            enable row level security;
alter table pedido_item_adicionales enable row level security;
alter table contadores_pedidos      enable row level security; -- sin políticas: solo triggers

-- Comercios: admins gestionan; miembros leen el suyo
create policy comercios_admin on comercios for all using (es_admin()) with check (es_admin());
create policy comercios_leer  on comercios for select using (
  exists (select 1 from miembros where comercio_id = comercios.id and perfil_id = auth.uid())
);

-- Perfiles: cada uno el suyo; admins todos; dueños ven a su personal
create policy perfiles_propio on perfiles for select using (id = auth.uid() or es_admin());
create policy perfiles_editar on perfiles for update using (id = auth.uid() or es_admin())
  with check (es_admin() or es_admin = false);
create policy perfiles_personal on perfiles for select using (
  exists (
    select 1 from miembros m
    where m.perfil_id = perfiles.id and tiene_rol(m.comercio_id, '{duenio}')
  )
);

-- Miembros: admins todo; dueño gestiona su personal; cada uno ve su membresía
create policy miembros_admin  on miembros for all using (es_admin()) with check (es_admin());
create policy miembros_duenio on miembros for all
  using (tiene_rol(comercio_id, '{duenio}'))
  with check (tiene_rol(comercio_id, '{duenio}') and rol <> 'duenio');
create policy miembros_propio on miembros for select using (perfil_id = auth.uid());

-- Carta: miembros leen; dueño escribe; admins todo
do $$
declare t text;
begin
  foreach t in array array['sectores','miembro_sectores','categorias','productos','adicionales','producto_adicionales','mesas']
  loop
    execute format('create policy %1$s_admin on %1$s for all using (es_admin()) with check (es_admin())', t);
    execute format('create policy %1$s_leer on %1$s for select using (es_miembro(comercio_id))', t);
    execute format('create policy %1$s_duenio on %1$s for all using (tiene_rol(comercio_id, ''{duenio}'')) with check (tiene_rol(comercio_id, ''{duenio}''))', t);
  end loop;
end $$;

-- Mostrador puede marcar "sin stock" (la app solo toca esa columna)
create policy productos_stock on productos for update
  using (tiene_rol(comercio_id, '{mostrador}'))
  with check (tiene_rol(comercio_id, '{mostrador}'));

-- Cuentas: mozo, dueño y mostrador
create policy cuentas_admin on cuentas for all using (es_admin()) with check (es_admin());
create policy cuentas_leer  on cuentas for select using (es_miembro(comercio_id));
create policy cuentas_escribir on cuentas for all
  using (tiene_rol(comercio_id, '{duenio,mostrador,mozo}'))
  with check (tiene_rol(comercio_id, '{duenio,mostrador,mozo}'));

-- Pedidos, ítems y adicionales: todos los miembros leen; escriben según rol
do $$
declare t text;
begin
  foreach t in array array['pedidos','pedido_items','pedido_item_adicionales']
  loop
    execute format('create policy %1$s_admin on %1$s for all using (es_admin()) with check (es_admin())', t);
    execute format('create policy %1$s_leer on %1$s for select using (es_miembro(comercio_id))', t);
    execute format('create policy %1$s_escribir on %1$s for all using (tiene_rol(comercio_id, ''{duenio,mostrador,mozo}'')) with check (tiene_rol(comercio_id, ''{duenio,mostrador,mozo}''))', t);
  end loop;
end $$;

-- Rol 'sector' solo actualiza ítems de los sectores que tiene asignados en
-- miembro_sectores (la app solo cambia estado / listo_en; afinar con una
-- función RPC si hace falta)
create policy items_sector on pedido_items for update
  using (
    tiene_rol(comercio_id, '{sector}')
    and exists (
      select 1
      from miembro_sectores ms
      join miembros m on m.id = ms.miembro_id
      where ms.sector_id = pedido_items.sector_id
        and m.perfil_id = auth.uid()
        and m.comercio_id = pedido_items.comercio_id
    )
  )
  with check (tiene_rol(comercio_id, '{sector}'));

-- ---------------------------------------------------------------------
-- Lectura pública de la carta (landing y QR de mesa)
-- Se expone con una función, no con políticas para anon.
-- ---------------------------------------------------------------------
create or replace function carta_publica(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
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
          from productos p where p.categoria_id = cat.id and p.activo
        ), '[]'::jsonb)
      ) order by cat.orden)
      from categorias cat where cat.comercio_id = c.id and cat.activo
    ), '[]'::jsonb)
  )
  from comercios c
  where c.slug = p_slug and c.estado = 'activo';
$$;

-- Parte de la API pública (landing y QR de mesa, sin sesión): sí necesita
-- anon.
revoke execute on function carta_publica(text) from public;
grant execute on function carta_publica(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Pedido desde la landing (anónimo)
-- p_items: [{ "producto_id": uuid, "cantidad": int, "nota": text, "adicionales": [uuid] }]
-- Los precios se toman de la base, nunca del cliente.
-- ---------------------------------------------------------------------
create or replace function crear_pedido_landing(
  p_slug text,
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_modalidad modalidad_pedido,
  p_direccion text,
  p_nota text,
  p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
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
    select p.id, p.nombre, p.precio, coalesce(p.sector_id, c.sector_id) as sector_id
      into v_prod
      from productos p join categorias c on c.id = p.categoria_id
     where p.id = (v_item->>'producto_id')::uuid
       and p.comercio_id = v_comercio.id and p.activo and not p.sin_stock;
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
end $$;

-- Parte de la API pública (pedido desde la landing, sin sesión): sí
-- necesita anon.
revoke execute on function crear_pedido_landing(text, text, text, modalidad_pedido, text, text, jsonb) from public;
grant execute on function crear_pedido_landing(text, text, text, modalidad_pedido, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table pedidos, pedido_items, cuentas;

-- ---------------------------------------------------------------------
-- Un comercio tiene exactamente un dueño (docs/SCHEMA.md, sección "Roles")
-- ---------------------------------------------------------------------
-- Mismo patrón que `cuenta_abierta_unica` más arriba: índice único parcial,
-- solo sobre las filas con rol = 'duenio'. No depende de `activo` a
-- propósito: aunque se desactive al dueño, sigue siendo el titular.
create unique index miembros_un_duenio_por_comercio
  on miembros (comercio_id)
  where rol = 'duenio';
