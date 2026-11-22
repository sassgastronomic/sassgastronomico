-- =====================================================================
-- Caja: lo que define si el local está operativo.
--
-- La jornada arranca cuando se abre la caja y termina cuando se cierra.
-- Con la caja cerrada, el local no opera: no entran pedidos (ni de la
-- landing ni del mozo) y no se abren mesas. Lo garantiza la base, no solo
-- las pantallas.
--
-- Gestión interna, no fiscalización: no emite comprobantes, no reemplaza
-- el cierre fiscal ni discrimina impuestos. El resumen de cierre es un
-- resumen de gestión.
--
-- 1. Tabla `cajas`: una por comercio y jornada; una sola abierta por
--    comercio a la vez (índice único parcial).
-- 2. La jornada de cada pedido nuevo es la de la caja abierta (antes salía
--    del reloj y la hora de corte): así cada cierre cubre exactamente lo
--    que se vendió con esa caja, aunque haya quedado abierta pasada la
--    hora de corte. Sin caja abierta, el pedido se rechaza.
-- 3. Sin caja abierta no se abre ninguna mesa.
-- 4. Funciones para abrir, ver el resumen y cerrar (dueño y mostrador).
-- 5. carta_publica dice si el local está tomando pedidos.
-- =====================================================================

-- 1. Cajas ----------------------------------------------------------------
create type estado_caja as enum ('abierta', 'cerrada');

create table cajas (
  id                    uuid primary key default gen_random_uuid(),
  comercio_id           uuid not null references comercios(id),
  -- La jornada que cubre: la de la hora de corte cuando se abrió
  -- (jornada_actual). Es la misma que llevan sus pedidos.
  jornada               date not null,
  estado                estado_caja not null default 'abierta',
  abierta_por           uuid references perfiles(id),
  abierta_en            timestamptz not null default now(),
  cerrada_por           uuid references perfiles(id),
  cerrada_en            timestamptz,
  -- Foto del resumen al cerrar (para consultarlo después sin recalcular)
  -- y cuántos productos sin stock se reactivaron.
  resumen               jsonb,
  productos_reactivados integer,
  -- Una caja por jornada: si se cierra por error, se reabre la misma
  -- (abrir_caja), en vez de partir los números del día en dos.
  constraint cajas_jornada_unica unique (comercio_id, jornada),
  constraint cajas_cierre_coherente check ((estado = 'cerrada') = (cerrada_en is not null))
);

-- Solo una abierta por comercio a la vez.
create unique index cajas_una_abierta on cajas (comercio_id) where estado = 'abierta';

alter table cajas enable row level security;

-- Todo el personal puede ver si la caja está abierta (el mozo lo
-- necesita); nadie la escribe directo: solo las funciones de abajo.
create policy cajas_leer on cajas for select using (es_miembro(comercio_id));
create policy cajas_admin on cajas for all using (es_admin()) with check (es_admin());

-- Las pantallas del mozo y del mostrador se enteran en vivo de que se
-- abrió o se cerró.
alter publication supabase_realtime add table cajas;

-- 2. Pedidos: la jornada es la de la caja abierta -------------------------
-- Mismo trigger de numeración de siempre (pedido_numero, before insert):
-- ahora toma la jornada de la caja abierta y, si no hay, rechaza el
-- pedido. `for share`: mientras se crea el pedido, nadie puede cerrar esa
-- caja (cerrar_caja la toma `for update`), así que un pedido nunca queda
-- adentro de una caja que se cerró al mismo tiempo.
create or replace function asignar_numero_pedido()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_jornada date;
begin
  select jornada into v_jornada from cajas
   where comercio_id = new.comercio_id and estado = 'abierta'
   for share;
  if not found then
    raise exception '%', case
      when new.origen = 'landing' then 'Este local no está tomando pedidos en este momento'
      else 'La caja no está abierta: pedile al mostrador que la abra'
    end;
  end if;

  new.jornada := v_jornada;
  insert into contadores_pedidos (comercio_id, jornada, ultimo)
  values (new.comercio_id, new.jornada, 1)
  on conflict (comercio_id, jornada)
  do update set ultimo = contadores_pedidos.ultimo + 1
  returning ultimo into new.numero;
  return new;
end $function$;

revoke execute on function asignar_numero_pedido() from public, anon, authenticated;

-- 3. Mesas: sin caja abierta no se abre ninguna ---------------------------
create or replace function exigir_caja_abierta()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
begin
  perform 1 from cajas
   where comercio_id = new.comercio_id and estado = 'abierta'
   for share;
  if not found then
    raise exception 'La caja no está abierta: pedile al mostrador que la abra';
  end if;
  return new;
end $function$;

revoke execute on function exigir_caja_abierta() from public, anon, authenticated;

create trigger cuentas_exigen_caja
  before insert on cuentas
  for each row execute function exigir_caja_abierta();

-- 4. Funciones de la caja --------------------------------------------------

-- Para la pantalla de caja: la jornada de hoy (por la hora de corte), la
-- caja abierta si hay (con el nombre de quien la abrió: `perfiles` no le
-- deja leer ese nombre al mostrador, por eso security definer), y si la
-- de hoy ya se cerró (abrir de nuevo la reabre). Null si quien pregunta no
-- es dueño ni mostrador.
create or replace function situacion_caja(p_comercio_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when tiene_rol(p_comercio_id, '{duenio,mostrador}') then
    jsonb_build_object(
      'jornada_actual', jornada_actual(p_comercio_id),
      'abierta', (
        select jsonb_build_object(
          'id', k.id,
          'jornada', k.jornada,
          'abierta_en', k.abierta_en,
          -- La hora ya en la zona horaria del local, lista para mostrar.
          'hora_apertura', to_char(k.abierta_en at time zone c.zona_horaria, 'HH24:MI'),
          'abierta_por', p.nombre
        )
          from cajas k
          join comercios c on c.id = k.comercio_id
          left join perfiles p on p.id = k.abierta_por
         where k.comercio_id = p_comercio_id and k.estado = 'abierta'
      ),
      'cerrada_hoy', exists (
        select 1 from cajas
         where comercio_id = p_comercio_id
           and estado = 'cerrada'
           and jornada = jornada_actual(p_comercio_id)
      )
    )
  end;
$$;

revoke execute on function situacion_caja(uuid) from public, anon;
grant execute on function situacion_caja(uuid) to authenticated;

-- Abrir la caja de la jornada de hoy. Si quedó abierta la de una jornada
-- anterior, no deja: hay que cerrarla primero (con sus propios números).
-- Si la de hoy ya se había cerrado, la reabre.
create or replace function abrir_caja(p_comercio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jornada date;
  v_abierta cajas%rowtype;
  v_caja    cajas%rowtype;
begin
  if not tiene_rol(p_comercio_id, '{duenio,mostrador}') then
    raise exception 'No autorizado';
  end if;

  v_jornada := jornada_actual(p_comercio_id);

  select * into v_abierta from cajas
   where comercio_id = p_comercio_id and estado = 'abierta';
  if found then
    if v_abierta.jornada = v_jornada then
      raise exception 'La caja ya está abierta';
    end if;
    raise exception 'Quedó abierta la caja de una jornada anterior: cerrala antes de abrir la de hoy';
  end if;

  update cajas
     set estado = 'abierta', cerrada_en = null, cerrada_por = null,
         resumen = null, productos_reactivados = null
   where comercio_id = p_comercio_id and jornada = v_jornada
  returning * into v_caja;
  if found then
    return jsonb_build_object('id', v_caja.id, 'jornada', v_caja.jornada, 'reabierta', true);
  end if;

  insert into cajas (comercio_id, jornada, abierta_por)
  values (p_comercio_id, v_jornada, auth.uid())
  returning * into v_caja;
  return jsonb_build_object('id', v_caja.id, 'jornada', v_caja.jornada, 'reabierta', false);
end;
$$;

revoke execute on function abrir_caja(uuid) from public, anon;
grant execute on function abrir_caja(uuid) to authenticated;

-- El resumen de una jornada: solo sus pedidos (por el campo `jornada`),
-- nunca lo acumulado desde el cierre anterior. Lo cancelado no suma.
-- - pedidos: salón (mesas y rondas, por cuenta) y take away, más los
--   cancelados aparte;
-- - total vendido: con las copias de precio de cada ítem y sus
--   adicionales;
-- - por categoría (con sus productos adentro), de mayor a menor;
-- - lo que impide cerrar: mesas con cuenta abierta y pedidos de la
--   jornada sin entregar.
-- Uso interno (lo llaman resumen_caja y cerrar_caja).
create or replace function resumen_de_jornada(p_comercio_id uuid, p_jornada date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pedidos_jornada as (
    select * from pedidos
     where comercio_id = p_comercio_id and jornada = p_jornada
  ),
  validos as (
    select * from pedidos_jornada where estado <> 'cancelado'
  ),
  lineas as (
    select coalesce(i.categoria_nombre, 'Sin categoría') as categoria,
           i.nombre,
           i.cantidad,
           (i.precio_unitario + coalesce((
              select sum(a.precio_extra) from pedido_item_adicionales a where a.item_id = i.id
            ), 0)) * i.cantidad as importe
      from pedido_items i
      join validos v on v.id = i.pedido_id
  )
  select jsonb_build_object(
    'jornada', p_jornada,
    'pedidos', jsonb_build_object(
      'salon_mesas', (select count(distinct cuenta_id) from validos where cuenta_id is not null),
      'salon_rondas', (select count(*) from validos where cuenta_id is not null),
      'take_away', (select count(*) from validos where cuenta_id is null),
      'cancelados', (select count(*) from pedidos_jornada where estado = 'cancelado')
    ),
    'total', coalesce((select sum(importe) from lineas), 0),
    'categorias', coalesce((
      select jsonb_agg(cat.dato order by cat.total desc)
        from (
          select l.categoria,
                 sum(l.importe) as total,
                 jsonb_build_object(
                   'nombre', l.categoria,
                   'unidades', sum(l.cantidad),
                   'total', sum(l.importe),
                   'productos', (
                     select jsonb_agg(jsonb_build_object(
                              'nombre', pr.nombre, 'unidades', pr.unidades, 'total', pr.total
                            ) order by pr.total desc)
                       from (
                         select l2.nombre, sum(l2.cantidad) as unidades, sum(l2.importe) as total
                           from lineas l2
                          where l2.categoria = l.categoria
                          group by l2.nombre
                       ) pr
                   )
                 ) as dato
            from lineas l
           group by l.categoria
        ) cat
    ), '[]'::jsonb),
    'pendientes', jsonb_build_object(
      'mesas_abiertas', coalesce((
        select jsonb_agg(m.nombre order by m.nombre)
          from cuentas cu
          join mesas m on m.id = cu.mesa_id
         where cu.comercio_id = p_comercio_id and cu.estado = 'abierta'
      ), '[]'::jsonb),
      'pedidos_sin_entregar', coalesce((
        select jsonb_agg(numero order by numero)
          from pedidos_jornada
         where estado in ('pendiente_confirmar', 'confirmado')
      ), '[]'::jsonb)
    )
  );
$$;

revoke execute on function resumen_de_jornada(uuid, date) from public, anon, authenticated;

-- El resumen de una caja (antes de cerrarla, o de una ya cerrada).
create or replace function resumen_caja(p_caja_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caja cajas%rowtype;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found or not tiene_rol(v_caja.comercio_id, '{duenio,mostrador}') then
    raise exception 'No encontramos esa caja';
  end if;
  return resumen_de_jornada(v_caja.comercio_id, v_caja.jornada);
end;
$$;

revoke execute on function resumen_caja(uuid) from public, anon;
grant execute on function resumen_caja(uuid) to authenticated;

-- Cerrar una caja. No cierra si quedan mesas con cuenta abierta o pedidos
-- de su jornada sin entregar: en ese caso devuelve `ok: false` con qué
-- falta (como cerrar_cuenta). Al cerrar, reactiva todos los productos sin
-- stock del comercio (se asume que el local repone para la jornada
-- siguiente) y guarda la foto del resumen.
create or replace function cerrar_caja(p_caja_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja        cajas%rowtype;
  v_resumen     jsonb;
  v_reactivados integer;
begin
  -- `for update`: espera a que terminen los pedidos o mesas que se están
  -- creando en este momento (toman la caja `for share`), y después ninguno
  -- nuevo puede entrar.
  select * into v_caja from cajas where id = p_caja_id for update;
  if not found or not tiene_rol(v_caja.comercio_id, '{duenio,mostrador}') then
    raise exception 'No encontramos esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;

  v_resumen := resumen_de_jornada(v_caja.comercio_id, v_caja.jornada);
  if jsonb_array_length(v_resumen->'pendientes'->'mesas_abiertas') > 0
     or jsonb_array_length(v_resumen->'pendientes'->'pedidos_sin_entregar') > 0 then
    return jsonb_build_object('ok', false, 'pendientes', v_resumen->'pendientes');
  end if;

  update productos set sin_stock = false
   where comercio_id = v_caja.comercio_id and sin_stock;
  get diagnostics v_reactivados = row_count;

  update cajas
     set estado = 'cerrada',
         cerrada_en = now(),
         cerrada_por = auth.uid(),
         resumen = v_resumen - 'pendientes',
         productos_reactivados = v_reactivados
   where id = p_caja_id;

  return jsonb_build_object(
    'ok', true,
    'reactivados', v_reactivados,
    'resumen', v_resumen - 'pendientes'
  );
end;
$$;

revoke execute on function cerrar_caja(uuid) from public, anon;
grant execute on function cerrar_caja(uuid) to authenticated;

-- 5. carta_publica --------------------------------------------------------
-- Igual que en 20261010005433, más `tomando_pedidos`: si hay caja abierta.
-- Con la caja cerrada la landing muestra la carta igual (para ver
-- precios), pero no deja pedir.
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
    'comercio', jsonb_build_object(
      'nombre', c.nombre,
      'plan', c.plan,
      'whatsapp', c.whatsapp,
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
$function$;

revoke execute on function carta_publica(text) from public, anon;
grant execute on function carta_publica(text) to anon, authenticated, postgres, service_role;
