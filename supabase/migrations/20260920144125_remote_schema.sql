SET local check_function_bodies = off;

CREATE TABLE "public"."adicionales" (
  "id"           uuid          NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id"  uuid          NOT NULL,
  "nombre"       text          NOT NULL,
  "precio_extra" numeric(12,2) NOT NULL DEFAULT 0,
  "activo"       boolean       NOT NULL DEFAULT true,
  CONSTRAINT "adicionales_pkey" PRIMARY KEY (id),
  CONSTRAINT "adicionales_precio_extra_check" CHECK ((precio_extra >= (0)::numeric))
);

ALTER TABLE "public"."adicionales"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."categorias" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id" uuid    NOT NULL,
  "nombre"      text    NOT NULL,
  "sector_id"   uuid    NOT NULL,
  "orden"       integer NOT NULL DEFAULT 0,
  "activo"      boolean NOT NULL DEFAULT true,
  CONSTRAINT "categorias_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."categorias"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."comercios" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "nombre"          text                     NOT NULL,
  "slug"            text                     NOT NULL,
  "limite_usuarios" integer                  NOT NULL DEFAULT 10,
  "zona_horaria"    text                     NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'::text,
  "hora_corte"      time without time zone   NOT NULL DEFAULT '06:00:00'::time WITHOUT time zone,
  "creado_en"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "comercios_limite_usuarios_check" CHECK ((limite_usuarios > 0)),
  CONSTRAINT "comercios_pkey" PRIMARY KEY (id),
  CONSTRAINT "comercios_slug_check" CHECK ((slug ~ '^[a-z0-9-]+$'::text)),
  CONSTRAINT "comercios_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."comercios"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."contadores_pedidos" (
  "comercio_id" uuid    NOT NULL,
  "jornada"     date    NOT NULL,
  "ultimo"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "contadores_pedidos_pkey" PRIMARY KEY (comercio_id, jornada)
);

ALTER TABLE "public"."contadores_pedidos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cuentas" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id" uuid                     NOT NULL,
  "mesa_id"     uuid                     NOT NULL,
  "mozo_id"     uuid,
  "abierta_en"  timestamp with time zone NOT NULL DEFAULT now(),
  "cerrada_en"  timestamp with time zone,
  CONSTRAINT "cuentas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."cuentas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."mesas" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id" uuid    NOT NULL,
  "nombre"      text    NOT NULL,
  "orden"       integer NOT NULL DEFAULT 0,
  "activo"      boolean NOT NULL DEFAULT true,
  CONSTRAINT "mesas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."mesas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."miembro_sectores" (
  "comercio_id" uuid NOT NULL,
  "miembro_id"  uuid NOT NULL,
  "sector_id"   uuid NOT NULL,
  CONSTRAINT "miembro_sectores_pkey" PRIMARY KEY (miembro_id, sector_id)
);

ALTER TABLE "public"."miembro_sectores"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."miembros" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id" uuid                     NOT NULL,
  "perfil_id"   uuid                     NOT NULL,
  "activo"      boolean                  NOT NULL DEFAULT true,
  "creado_en"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "miembros_comercio_id_perfil_id_key" UNIQUE (comercio_id, perfil_id),
  CONSTRAINT "miembros_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."miembros"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pedido_item_adicionales" (
  "id"           uuid          NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id"  uuid          NOT NULL,
  "item_id"      uuid          NOT NULL,
  "adicional_id" uuid,
  "nombre"       text          NOT NULL,
  "precio_extra" numeric(12,2) NOT NULL,
  CONSTRAINT "pedido_item_adicionales_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pedido_item_adicionales"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pedido_items" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id"     uuid                     NOT NULL,
  "pedido_id"       uuid                     NOT NULL,
  "producto_id"     uuid,
  "nombre"          text                     NOT NULL,
  "precio_unitario" numeric(12,2)            NOT NULL,
  "cantidad"        integer                  NOT NULL,
  "nota"            text,
  "sector_id"       uuid                     NOT NULL,
  "listo_en"        timestamp with time zone,
  "entregado_en"    timestamp with time zone,
  CONSTRAINT "pedido_items_cantidad_check" CHECK ((cantidad > 0)),
  CONSTRAINT "pedido_items_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pedido_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pedidos" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id"        uuid                     NOT NULL,
  "jornada"            date,
  "numero"             integer,
  "cuenta_id"          uuid,
  "cliente_nombre"     text,
  "cliente_telefono"   text,
  "direccion"          text,
  "nota"               text,
  "creado_por"         uuid,
  "creado_en"          timestamp with time zone NOT NULL DEFAULT now(),
  "confirmado_en"      timestamp with time zone,
  "cancelado_en"       timestamp with time zone,
  "motivo_cancelacion" text,
  CONSTRAINT "pedidos_comercio_id_jornada_numero_key" UNIQUE (comercio_id, jornada, numero),
  CONSTRAINT "pedidos_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pedidos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."perfiles" (
  "id"        uuid                     NOT NULL,
  "nombre"    text                     NOT NULL DEFAULT ''::text,
  "email"     text,
  "es_admin"  boolean                  NOT NULL DEFAULT false,
  "creado_en" timestamp with time zone NOT NULL DEFAULT now(),
  "usuario"   text,
  CONSTRAINT "perfiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "perfiles_usuario_formato" CHECK (((usuario IS NULL) OR (usuario ~ '^[a-z0-9._]{3,30}$'::text))),
  CONSTRAINT "perfiles_usuario_key" UNIQUE (usuario)
);

ALTER TABLE "public"."perfiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."producto_adicionales" (
  "comercio_id"  uuid NOT NULL,
  "producto_id"  uuid NOT NULL,
  "adicional_id" uuid NOT NULL,
  CONSTRAINT "producto_adicionales_pkey" PRIMARY KEY (producto_id, adicional_id)
);

ALTER TABLE "public"."producto_adicionales"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."productos" (
  "id"           uuid          NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id"  uuid          NOT NULL,
  "categoria_id" uuid          NOT NULL,
  "nombre"       text          NOT NULL,
  "descripcion"  text,
  "precio"       numeric(12,2) NOT NULL,
  "imagen_url"   text,
  "sector_id"    uuid,
  "sin_stock"    boolean       NOT NULL DEFAULT false,
  "activo"       boolean       NOT NULL DEFAULT true,
  "orden"        integer       NOT NULL DEFAULT 0,
  CONSTRAINT "productos_pkey" PRIMARY KEY (id),
  CONSTRAINT "productos_precio_check" CHECK ((precio >= (0)::numeric))
);

ALTER TABLE "public"."productos"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sectores" (
  "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
  "comercio_id" uuid    NOT NULL,
  "nombre"      text    NOT NULL,
  "orden"       integer NOT NULL DEFAULT 0,
  "activo"      boolean NOT NULL DEFAULT true,
  CONSTRAINT "sectores_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sectores"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."estado_comercio" AS ENUM (
  'activo',
  'suspendido'
);

ALTER TABLE "public"."comercios"
  ADD COLUMN "estado" public.estado_comercio NOT NULL DEFAULT 'activo'::public.estado_comercio;

CREATE TYPE "public"."estado_cuenta" AS ENUM (
  'abierta',
  'cerrada'
);

ALTER TABLE "public"."cuentas"
  ADD COLUMN "estado" public.estado_cuenta NOT NULL DEFAULT 'abierta'::public.estado_cuenta;

CREATE TYPE "public"."estado_item" AS ENUM (
  'pendiente',
  'en_preparacion',
  'listo',
  'entregado'
);

ALTER TABLE "public"."pedido_items"
  ADD COLUMN "estado" public.estado_item NOT NULL DEFAULT 'pendiente'::public.estado_item;

CREATE TYPE "public"."estado_pedido" AS ENUM (
  'pendiente_confirmar',
  'confirmado',
  'entregado',
  'cancelado'
);

ALTER TABLE "public"."pedidos"
  ADD COLUMN "estado" public.estado_pedido NOT NULL DEFAULT 'confirmado'::public.estado_pedido;

CREATE TYPE "public"."modalidad_pedido" AS ENUM (
  'retiro',
  'envio'
);

ALTER TABLE "public"."pedidos"
  ADD COLUMN "modalidad" public.modalidad_pedido;

CREATE TYPE "public"."origen_pedido" AS ENUM (
  'landing',
  'mozo',
  'qr_mesa',
  'mostrador'
);

ALTER TABLE "public"."pedidos"
  ADD COLUMN "origen" public.origen_pedido NOT NULL;

CREATE TYPE "public"."plan_comercio" AS ENUM (
  'take_away',
  'salon',
  'completo'
);

ALTER TABLE "public"."comercios"
  ADD COLUMN "plan" public.plan_comercio NOT NULL DEFAULT 'take_away'::public.plan_comercio;

CREATE TYPE "public"."rol_miembro" AS ENUM (
  'duenio',
  'mostrador',
  'mozo',
  'cocina',
  'barra',
  'sector'
);

ALTER TABLE "public"."miembros"
  ADD COLUMN "rol" public.rol_miembro NOT NULL;

CREATE OR REPLACE FUNCTION public.actualizar_nombre_miembro (
  p_miembro_id uuid,
  p_nombre     text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.asignar_numero_pedido()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  new.jornada := jornada_actual(new.comercio_id);
  insert into contadores_pedidos (comercio_id, jornada, ultimo)
  values (new.comercio_id, new.jornada, 1)
  on conflict (comercio_id, jornada)
  do update set ultimo = contadores_pedidos.ultimo + 1
  returning ultimo into new.numero;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.carta_publica (
  p_slug text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_pedido_si_completo()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.estado = 'entregado' and not exists (
    select 1 from pedido_items
    where pedido_id = new.pedido_id and estado <> 'entregado'
  ) then
    update pedidos set estado = 'entregado'
    where id = new.pedido_id and estado = 'confirmado';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.crear_pedido_landing (
  p_slug             text,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_modalidad        public.modalidad_pedido,
  p_direccion        text,
  p_nota             text,
  p_items            jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.crear_perfil_nuevo_usuario()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into perfiles (id, email, nombre, usuario)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    new.raw_user_meta_data->>'usuario'
  );
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.crear_sector_por_defecto()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  insert into sectores (comercio_id, nombre, orden) values (new.id, 'Cocina', 0);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.es_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.es_miembro (
  p_comercio uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select tiene_rol(p_comercio, enum_range(null::rol_miembro));
$function$;

CREATE OR REPLACE FUNCTION public.jornada_actual (
  p_comercio uuid
)
  RETURNS date
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select ((now() at time zone c.zona_horaria) - c.hora_corte)::date
  from comercios c where c.id = p_comercio;
$function$;

CREATE OR REPLACE FUNCTION public.plan_permite_rol (
  p_plan public.plan_comercio,
  p_rol  public.rol_miembro
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
  select case
    when p_rol = 'mozo' then p_plan in ('salon', 'completo')
    else true
  end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tiene_rol (
  p_comercio uuid,
  p_roles    public.rol_miembro[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.usuario_disponible (
  p_usuario text
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not exists (
    select 1 from miembros
    where perfil_id = auth.uid() and rol = 'duenio' and activo
  ) then
    raise exception 'No autorizado';
  end if;
  return not exists (select 1 from perfiles where usuario = p_usuario);
end $function$;

CREATE OR REPLACE FUNCTION public.usuarios_ocupados (
  p_comercio uuid
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select count(*)::int
  from miembros m join comercios c on c.id = m.comercio_id
  where m.comercio_id = p_comercio and m.activo and plan_permite_rol(c.plan, m.rol);
$function$;

CREATE OR REPLACE FUNCTION public.validar_cambio_plan()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.validar_limite_usuarios()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_limite int;
begin
  if new.activo and (tg_op = 'INSERT' or not old.activo) then
    select limite_usuarios into v_limite from comercios where id = new.comercio_id;
    if usuarios_ocupados(new.comercio_id) >= v_limite then
      raise exception 'Llegaste al máximo de usuarios de tu plan';
    end if;
  end if;
  return new;
end $function$;

ALTER TABLE "public"."adicionales"
  ADD CONSTRAINT "adicionales_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."categorias"
  ADD CONSTRAINT "categorias_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."contadores_pedidos"
  ADD CONSTRAINT "contadores_pedidos_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."cuentas"
  ADD CONSTRAINT "cuentas_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."mesas"
  ADD CONSTRAINT "mesas_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."cuentas"
  ADD CONSTRAINT "cuentas_mesa_id_fkey" FOREIGN KEY (mesa_id) REFERENCES public.mesas(id);

ALTER TABLE "public"."miembro_sectores"
  ADD CONSTRAINT "miembro_sectores_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."miembros"
  ADD CONSTRAINT "miembros_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."miembro_sectores"
  ADD CONSTRAINT "miembro_sectores_miembro_id_fkey" FOREIGN KEY (miembro_id) REFERENCES public.miembros(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedido_item_adicionales"
  ADD CONSTRAINT "pedido_item_adicionales_adicional_id_fkey" FOREIGN KEY (adicional_id) REFERENCES public.adicionales(id);

ALTER TABLE "public"."pedido_item_adicionales"
  ADD CONSTRAINT "pedido_item_adicionales_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedido_items"
  ADD CONSTRAINT "pedido_items_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedido_item_adicionales"
  ADD CONSTRAINT "pedido_item_adicionales_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.pedido_items(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedidos"
  ADD CONSTRAINT "pedidos_check1" CHECK (((modalidad IS DISTINCT FROM 'envio'::public.modalidad_pedido) OR (direccion IS NOT NULL)));

ALTER TABLE "public"."pedidos"
  ADD CONSTRAINT "pedidos_check" CHECK ((((cuenta_id IS NULL) AND (cliente_nombre IS NOT NULL) AND (modalidad IS NOT NULL)) OR (cuenta_id IS NOT NULL)));

ALTER TABLE "public"."pedidos"
  ADD CONSTRAINT "pedidos_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedidos"
  ADD CONSTRAINT "pedidos_cuenta_id_fkey" FOREIGN KEY (cuenta_id) REFERENCES public.cuentas(id);

ALTER TABLE "public"."pedido_items"
  ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;

ALTER TABLE "public"."perfiles"
  ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."cuentas"
  ADD CONSTRAINT "cuentas_mozo_id_fkey" FOREIGN KEY (mozo_id) REFERENCES public.perfiles(id);

ALTER TABLE "public"."miembros"
  ADD CONSTRAINT "miembros_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedidos"
  ADD CONSTRAINT "pedidos_creado_por_fkey" FOREIGN KEY (creado_por) REFERENCES public.perfiles(id);

ALTER TABLE "public"."producto_adicionales"
  ADD CONSTRAINT "producto_adicionales_adicional_id_fkey" FOREIGN KEY (adicional_id) REFERENCES public.adicionales(id) ON DELETE CASCADE;

ALTER TABLE "public"."producto_adicionales"
  ADD CONSTRAINT "producto_adicionales_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."productos"
  ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);

ALTER TABLE "public"."productos"
  ADD CONSTRAINT "productos_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedido_items"
  ADD CONSTRAINT "pedido_items_producto_id_fkey" FOREIGN KEY (producto_id) REFERENCES public.productos(id);

ALTER TABLE "public"."producto_adicionales"
  ADD CONSTRAINT "producto_adicionales_producto_id_fkey" FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;

ALTER TABLE "public"."sectores"
  ADD CONSTRAINT "sectores_comercio_id_fkey" FOREIGN KEY (comercio_id) REFERENCES public.comercios(id) ON DELETE CASCADE;

ALTER TABLE "public"."categorias"
  ADD CONSTRAINT "categorias_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES public.sectores(id);

ALTER TABLE "public"."miembro_sectores"
  ADD CONSTRAINT "miembro_sectores_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES public.sectores(id) ON DELETE CASCADE;

ALTER TABLE "public"."pedido_items"
  ADD CONSTRAINT "pedido_items_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES public.sectores(id);

ALTER TABLE "public"."productos"
  ADD CONSTRAINT "productos_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES public.sectores(id);

CREATE INDEX adicionales_comercio_id_idx ON public.adicionales USING btree (comercio_id);

CREATE INDEX categorias_comercio_id_idx ON public.categorias USING btree (comercio_id);

CREATE UNIQUE INDEX cuenta_abierta_unica ON public.cuentas USING btree (mesa_id)
  WHERE (estado = 'abierta'::public.estado_cuenta);

CREATE INDEX cuentas_comercio_id_estado_idx ON public.cuentas USING btree (comercio_id, estado);

CREATE INDEX mesas_comercio_id_idx ON public.mesas USING btree (comercio_id);

CREATE INDEX miembro_sectores_comercio_id_idx ON public.miembro_sectores USING btree (comercio_id);

CREATE INDEX miembros_perfil_id_idx ON public.miembros USING btree (perfil_id);

CREATE UNIQUE INDEX miembros_un_duenio_por_comercio ON public.miembros USING btree (comercio_id)
  WHERE (rol = 'duenio'::public.rol_miembro);

CREATE INDEX pedido_item_adicionales_item_id_idx ON public.pedido_item_adicionales USING btree (item_id);

CREATE INDEX pedido_items_comercio_id_sector_id_estado_idx ON public.pedido_items USING btree (comercio_id, sector_id, estado);

CREATE INDEX pedido_items_pedido_id_idx ON public.pedido_items USING btree (pedido_id);

CREATE INDEX pedidos_comercio_id_estado_idx ON public.pedidos USING btree (comercio_id, estado);

CREATE INDEX pedidos_cuenta_id_idx ON public.pedidos USING btree (cuenta_id);

CREATE INDEX productos_comercio_id_categoria_id_idx ON public.productos USING btree (comercio_id, categoria_id);

CREATE INDEX sectores_comercio_id_idx ON public.sectores USING btree (comercio_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_perfil_nuevo_usuario();

CREATE TRIGGER comercio_sector_por_defecto
  AFTER INSERT ON public.comercios
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_sector_por_defecto();

CREATE TRIGGER comercios_cambio_plan
  BEFORE UPDATE OF plan ON public.comercios
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_cambio_plan();

CREATE TRIGGER miembros_limite
  BEFORE INSERT OR UPDATE OF activo ON public.miembros
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_limite_usuarios();

CREATE TRIGGER item_entregado
  AFTER UPDATE OF estado ON public.pedido_items
  FOR EACH ROW
  EXECUTE FUNCTION public.cerrar_pedido_si_completo();

CREATE TRIGGER pedido_numero
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.asignar_numero_pedido();

CREATE POLICY "adicionales_admin" ON "public"."adicionales"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "adicionales_duenio" ON "public"."adicionales"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "adicionales_leer" ON "public"."adicionales"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "categorias_admin" ON "public"."categorias"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "categorias_duenio" ON "public"."categorias"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "categorias_leer" ON "public"."categorias"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "comercios_admin" ON "public"."comercios"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "comercios_leer" ON "public"."comercios"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.miembros
  WHERE ((miembros.comercio_id = comercios.id) AND (miembros.perfil_id = auth.uid())))));

CREATE POLICY "cuentas_admin" ON "public"."cuentas"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "cuentas_escribir" ON "public"."cuentas"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]));

CREATE POLICY "cuentas_leer" ON "public"."cuentas"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "mesas_admin" ON "public"."mesas"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "mesas_duenio" ON "public"."mesas"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "mesas_leer" ON "public"."mesas"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "miembro_sectores_admin" ON "public"."miembro_sectores"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "miembro_sectores_duenio" ON "public"."miembro_sectores"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "miembro_sectores_leer" ON "public"."miembro_sectores"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "miembros_admin" ON "public"."miembros"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "miembros_duenio" ON "public"."miembros"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK ((public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]) AND (rol <> 'duenio'::public.rol_miembro)));

CREATE POLICY "miembros_propio" ON "public"."miembros"
  FOR SELECT
  TO PUBLIC
  USING ((perfil_id = auth.uid()));

CREATE POLICY "pedido_item_adicionales_admin" ON "public"."pedido_item_adicionales"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "pedido_item_adicionales_escribir" ON "public"."pedido_item_adicionales"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]));

CREATE POLICY "pedido_item_adicionales_leer" ON "public"."pedido_item_adicionales"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "items_sector" ON "public"."pedido_items"
  FOR UPDATE
  TO PUBLIC
  USING ((public.tiene_rol(comercio_id, '{sector}'::public.rol_miembro[]) AND (EXISTS ( SELECT 1
   FROM (public.miembro_sectores ms
     JOIN public.miembros m ON ((m.id = ms.miembro_id)))
  WHERE ((ms.sector_id = pedido_items.sector_id) AND (m.perfil_id = auth.uid()) AND m.activo)))))
  WITH CHECK (public.tiene_rol(comercio_id, '{sector}'::public.rol_miembro[]));

CREATE POLICY "pedido_items_admin" ON "public"."pedido_items"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "pedido_items_escribir" ON "public"."pedido_items"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]));

CREATE POLICY "pedido_items_leer" ON "public"."pedido_items"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "pedidos_admin" ON "public"."pedidos"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "pedidos_escribir" ON "public"."pedidos"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio,mostrador,mozo}'::public.rol_miembro[]));

CREATE POLICY "pedidos_leer" ON "public"."pedidos"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "perfiles_editar" ON "public"."perfiles"
  FOR UPDATE
  TO PUBLIC
  USING (((id = auth.uid()) OR public.es_admin()))
  WITH CHECK ((public.es_admin() OR (es_admin = false)));

CREATE POLICY "perfiles_personal" ON "public"."perfiles"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.miembros m
  WHERE ((m.perfil_id = perfiles.id) AND public.tiene_rol(m.comercio_id, '{duenio}'::public.rol_miembro[])))));

CREATE POLICY "perfiles_propio" ON "public"."perfiles"
  FOR SELECT
  TO PUBLIC
  USING (((id = auth.uid()) OR public.es_admin()));

CREATE POLICY "producto_adicionales_admin" ON "public"."producto_adicionales"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "producto_adicionales_duenio" ON "public"."producto_adicionales"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "producto_adicionales_leer" ON "public"."producto_adicionales"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "productos_admin" ON "public"."productos"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "productos_duenio" ON "public"."productos"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "productos_leer" ON "public"."productos"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE POLICY "productos_stock" ON "public"."productos"
  FOR UPDATE
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{mostrador}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{mostrador}'::public.rol_miembro[]));

CREATE POLICY "sectores_admin" ON "public"."sectores"
  FOR ALL
  TO PUBLIC
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "sectores_duenio" ON "public"."sectores"
  FOR ALL
  TO PUBLIC
  USING (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]))
  WITH CHECK (public.tiene_rol(comercio_id, '{duenio}'::public.rol_miembro[]));

CREATE POLICY "sectores_leer" ON "public"."sectores"
  FOR SELECT
  TO PUBLIC
  USING (public.es_miembro(comercio_id));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."cuentas";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."pedido_items";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."pedidos";

REVOKE ALL ON FUNCTION "public"."actualizar_nombre_miembro"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."actualizar_nombre_miembro"(uuid, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."asignar_numero_pedido"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."asignar_numero_pedido"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."carta_publica"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."carta_publica"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cerrar_pedido_si_completo"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cerrar_pedido_si_completo"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crear_pedido_landing"(text, text, text, public.modalidad_pedido, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."crear_pedido_landing"(text, text, text, public.modalidad_pedido, text, text, jsonb) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crear_perfil_nuevo_usuario"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."crear_perfil_nuevo_usuario"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crear_sector_por_defecto"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."crear_sector_por_defecto"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."es_admin"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."es_admin"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."es_miembro"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."es_miembro"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."jornada_actual"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."jornada_actual"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."plan_permite_rol"(public.plan_comercio, public.rol_miembro) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."plan_permite_rol"(public.plan_comercio, public.rol_miembro) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."tiene_rol"(uuid, public.rol_miembro[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."tiene_rol"(uuid, public.rol_miembro[]) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."usuario_disponible"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."usuario_disponible"(text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."usuarios_ocupados"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."usuarios_ocupados"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."validar_cambio_plan"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."validar_cambio_plan"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."validar_limite_usuarios"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."validar_limite_usuarios"() TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."adicionales" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categorias" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."comercios" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."contadores_pedidos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cuentas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."mesas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."miembro_sectores" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."miembros" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pedido_item_adicionales" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pedido_items" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pedidos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."perfiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."producto_adicionales" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."productos" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sectores" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."estado_comercio" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_cuenta" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_item" TO "postgres";

GRANT USAGE ON TYPE "public"."estado_pedido" TO "postgres";

GRANT USAGE ON TYPE "public"."modalidad_pedido" TO "postgres";

GRANT USAGE ON TYPE "public"."origen_pedido" TO "postgres";

GRANT USAGE ON TYPE "public"."plan_comercio" TO "postgres";

GRANT USAGE ON TYPE "public"."rol_miembro" TO "postgres";

