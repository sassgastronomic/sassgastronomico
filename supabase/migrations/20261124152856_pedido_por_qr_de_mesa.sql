-- =====================================================================
-- Pedido por QR de mesa — la base.
--
-- El flujo: en cada mesa hay un QR impreso (el mismo para todas) que
-- lleva a la carta del local. El cliente arma su pedido en el celular,
-- confirma, y su pantalla le muestra un QR. El mozo lo escanea con la
-- cámara nativa de su celular — el link le abre la app, donde ya está
-- logueado —, elige la mesa y confirma: el pedido entra como una ronda
-- más de esa cuenta.
--
-- Por qué el QR del cliente lleva un código corto y no el carrito entero:
-- el QR queda chico y legible, y el cliente puede volver a abrirlo si
-- cierra la pestaña (el código le queda guardado en el celular). El costo
-- es una fila en la base por pedido armado, que es justamente lo que el
-- diseño original de docs/SCHEMA.md ("Pedido desde la mesa con QR")
-- quería evitar: por eso el borrador **no vale nada** hasta que un mozo
-- lo escanea — no es un pedido, no lleva número, no toca la caja, no
-- aparece en ninguna pantalla y vence solo.
--
-- Esta migración es solo el esquema y las funciones: la app todavía no
-- las usa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El interruptor por comercio, apagado por defecto.
-- ---------------------------------------------------------------------

-- Hoy `comercios` solo lo escriben los admins (policy `comercios_admin`;
-- el dueño apenas tiene `comercios_leer`), así que este interruptor se
-- prende desde /admin/comercios/[id], igual que el WhatsApp del local. Si
-- más adelante se quiere que lo maneje el dueño, hace falta una función
-- aparte que valide `tiene_rol(duenio)` adentro — no una policy de UPDATE
-- sobre `comercios`, que le habilitaría la fila entera (plan, estado y
-- límite de usuarios incluidos): el mismo error que se sacó en
-- `productos_stock` (ver docs/SCHEMA.md, "Disponibilidad durante la
-- jornada").
alter table comercios
  add column qr_mesa_activo boolean not null default false;

comment on column comercios.qr_mesa_activo is
  'Si el local toma pedidos por QR de mesa. Apagado por defecto: es una forma de trabajar que el local tiene que elegir, no algo que le aparezca solo.';

-- ---------------------------------------------------------------------
-- 2. La tabla de borradores.
-- ---------------------------------------------------------------------

create table borradores_pedido (
  id          uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references comercios(id) on delete cascade,

  -- El código que viaja en el QR. Corto a propósito: lo que define el
  -- tamaño del QR es el largo del link entero, y el dominio ya se come la
  -- mayor parte. 8 caracteres de base32 son 40 bits de azar (~1,1
  -- billones de códigos), de sobra para algo que vive media hora.
  -- Mayúsculas y dígitos nada más: así el QR entra en el modo
  -- alfanumérico del estándar, que es más denso que el de bytes, y el
  -- código se puede leer en voz alta o tipear a mano si hiciera falta.
  codigo      text not null unique,

  -- Exactamente la forma que espera `crear_ronda_en_cuenta`:
  -- [{producto_id, cantidad, nota, adicionales: [uuid]}]. Ids, cantidades
  -- y notas; ni nombres ni precios. El borrador no es una fuente de
  -- verdad de la carta: todo eso se resuelve recién cuando el mozo
  -- escanea, y guardar un precio de hace diez minutos sería tentar a
  -- usarlo.
  items       jsonb not null,

  creado_en   timestamptz not null default now(),
  vence_en    timestamptz not null,

  -- Cuándo se escaneó y en qué ronda quedó. El `pedido_id` no estaba
  -- pedido; se agrega porque es lo que permite que un segundo escaneo del
  -- mismo QR responda "ya lo cargaste, es la ronda #N" en vez de un
  -- "ya se usó" a secas.
  usado_en    timestamptz,
  pedido_id   uuid references pedidos(id) on delete cascade,

  -- Alfabeto base32 de Crockford: sin I, L, O ni U — las tres primeras se
  -- confunden con 1 y 0 al leerlas, y la U se evita para no formar
  -- palabras por accidente.
  constraint borradores_pedido_codigo_formato
    check (codigo ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),

  -- `case` y no `and`: Postgres no garantiza el orden en que evalúa un
  -- `and`, y `jsonb_array_length` falla si no recibe un array.
  constraint borradores_pedido_items
    check (case when jsonb_typeof(items) = 'array'
                then jsonb_array_length(items) between 1 and 50
                else false end),

  -- Las dos columnas del escaneo se escriben juntas o no se escriben. Por
  -- eso el FK de arriba es `on delete cascade` y no `set null`: anular
  -- solo `pedido_id` dejaría la fila violando este check.
  constraint borradores_pedido_usado_con_pedido
    check ((usado_en is null) = (pedido_id is null))
);

-- Sirve a la limpieza (vencidos de un comercio) y al filtro por comercio.
-- La búsqueda por código ya la cubre el índice único de la columna.
create index on borradores_pedido (comercio_id, vence_en);

alter table borradores_pedido enable row level security;

-- A propósito **no** lleva el trío de siempre (`_leer` para los miembros,
-- `_duenio` para escribir): nadie toca esta tabla directo. El cliente
-- escribe por `crear_borrador_qr` y el mozo lee y consume por
-- `convertir_borrador_qr`, las dos security definer. Con RLS prendida y
-- solo la policy de admins, la tabla nace con cero escrituras directas —
-- la misma invariante que se terminó de cerrar para `pedidos`,
-- `pedido_items` y `pedido_item_adicionales` en la migración
-- 20261124131822.
--
-- Pendiente para el paso de la app: la pantalla del mozo necesita *ver* el
-- borrador antes de elegir la mesa, y los ítems guardados son ids pelados.
-- Eso pide una tercera función de lectura (que resuelva nombres, precios y
-- disponibilidad del momento), no una policy de SELECT.
create policy borradores_pedido_admin on borradores_pedido for all
  using (es_admin())
  with check (es_admin());

-- ---------------------------------------------------------------------
-- 3. El código corto.
-- ---------------------------------------------------------------------

create or replace function nuevo_codigo_borrador()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes    bytea;
  v_codigo   text := '';
  i          int;
begin
  -- `extensions.` calificado a mano: `gen_random_bytes` la trae pgcrypto,
  -- que en Supabase vive en el esquema `extensions`, y con
  -- `search_path = public` (la regla del proyecto) no se resolvería sola.
  -- `gen_random_uuid()` sí funciona sin calificar en el resto de las
  -- funciones porque además existe en `pg_catalog`, que siempre está en el
  -- camino de búsqueda.
  v_bytes := extensions.gen_random_bytes(8);

  for i in 0..7 loop
    -- 256 es múltiplo exacto de 32, así que el resto no le da ventaja a
    -- ninguna letra del alfabeto.
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  return v_codigo;
end $$;

-- De uso interno: solo la llama `crear_borrador_qr`. Supabase le da
-- EXECUTE directo a `authenticated` a toda función nueva de `public`, así
-- que acá también se le revoca (ver docs/SCHEMA.md, "Funciones nuevas").
revoke execute on function nuevo_codigo_borrador() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. La ronda, en un solo lugar.
--
-- `crear_pedido_mozo` ya tenía adentro todo lo que el QR necesita: el
-- bloqueo de la cuenta, el chequeo de rol, la revalidación de
-- disponibilidad con la cadena completa (producto → categoría → sector
-- efectivo) y las copias de nombre, categoría, precio y sector. En vez de
-- duplicarlo, el cuerpo pasa a `crear_ronda_en_cuenta`, que recibe el
-- `origen`, y `crear_pedido_mozo` queda como la llamada de siempre con
-- `origen = 'mozo'`.
--
-- Por qué una función nueva y no un tercer parámetro con default en
-- `crear_pedido_mozo`: agregarle un argumento cambia la firma, así que no
-- reemplazaría a la actual sino que convivirían las dos, y una llamada con
-- dos argumentos quedaría ambigua entre ellas. Así la app sigue llamando
-- `crear_pedido_mozo(p_cuenta_id, p_items)` sin enterarse de nada.
-- ---------------------------------------------------------------------

create or replace function crear_ronda_en_cuenta(
  p_cuenta_id uuid,
  p_items     jsonb,
  p_origen    origen_pedido
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta  cuentas%rowtype;
  v_pedido  pedidos%rowtype;
  v_item    jsonb;
  v_prod    record;
  v_nombre  text;
  v_item_id uuid;
begin
  -- `for update`: el mismo bloqueo que toma `cerrar_cuenta`. Una ronda
  -- cargada en el instante en que se cierra la mesa nunca queda adentro de
  -- una cuenta cerrada.
  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found or v_cuenta.estado <> 'abierta' then
    raise exception 'Esa mesa no tiene una cuenta abierta';
  end if;

  if not tiene_rol(v_cuenta.comercio_id, '{duenio,mozo}') then
    raise exception 'No autorizado';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  -- `pedidos.numero`/`jornada` los asigna el trigger `pedido_numero`
  -- (asignar_numero_pedido) — no se calculan acá. Ese mismo trigger es el
  -- que exige la caja abierta.
  insert into pedidos (comercio_id, origen, estado, cuenta_id, creado_por)
  values (v_cuenta.comercio_id, p_origen, 'confirmado', p_cuenta_id, auth.uid())
  returning * into v_pedido;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Misma cadena que carta_publica/crear_pedido_landing: producto activo
    -- y con stock, categoría activa, sector efectivo (el propio del
    -- producto si lo pisa, si no el de su categoría) activo.
    select p.id, p.nombre, p.precio, c.nombre as categoria_nombre,
           coalesce(p.sector_id, c.sector_id) as sector_id
      into v_prod
      from productos p
      join categorias c on c.id = p.categoria_id
      join sectores s on s.id = coalesce(p.sector_id, c.sector_id)
     where p.id = (v_item->>'producto_id')::uuid
       and p.comercio_id = v_cuenta.comercio_id
       and p.activo and not p.sin_stock
       and c.activo
       and s.activo;

    if not found then
      -- Se busca el nombre aparte (sin los filtros de arriba) solo para
      -- poder avisar cuál producto fue, no para validar nada con esto.
      select nombre into v_nombre from productos
       where id = (v_item->>'producto_id')::uuid and comercio_id = v_cuenta.comercio_id;
      raise exception 'Ya no está disponible: %', coalesce(v_nombre, 'un producto del pedido');
    end if;

    insert into pedido_items (comercio_id, pedido_id, producto_id, nombre, categoria_nombre, precio_unitario, cantidad, nota, sector_id)
    values (v_cuenta.comercio_id, v_pedido.id, v_prod.id, v_prod.nombre, v_prod.categoria_nombre, v_prod.precio,
            greatest(coalesce((v_item->>'cantidad')::int, 1), 1), nullif(v_item->>'nota', ''), v_prod.sector_id)
    returning id into v_item_id;

    insert into pedido_item_adicionales (comercio_id, item_id, adicional_id, nombre, precio_extra)
    select v_cuenta.comercio_id, v_item_id, a.id, a.nombre, a.precio_extra
      from adicionales a
      join producto_adicionales pa on pa.adicional_id = a.id and pa.producto_id = v_prod.id
     where a.activo
       and a.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_item->'adicionales', '[]')) x);
  end loop;

  return jsonb_build_object('pedido_id', v_pedido.id, 'numero', v_pedido.numero);
end;
$$;

-- De uso interno: la llaman `crear_pedido_mozo` y `convertir_borrador_qr`,
-- las dos security definer y del mismo dueño, que tienen EXECUTE por ser
-- propietarias. Nadie la invoca desde afuera.
revoke execute on function crear_ronda_en_cuenta(uuid, jsonb, origen_pedido)
  from public, anon, authenticated;

create or replace function crear_pedido_mozo(
  p_cuenta_id uuid,
  p_items     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return crear_ronda_en_cuenta(p_cuenta_id, p_items, 'mozo');
end;
$$;

revoke execute on function crear_pedido_mozo(uuid, jsonb) from public, anon;
grant execute on function crear_pedido_mozo(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Limpieza de los vencidos.
--
-- Sin `p_comercio_id` barre todo (para enganchar a un cron el día que haga
-- falta: hoy el proyecto no tiene pg_cron); con comercio, solo los de ese
-- local, que es como la llama `crear_borrador_qr`.
--
-- Un borrador ya usado **no** se borra al usarlo: se queda hasta que
-- vence, para que un segundo escaneo del mismo QR reciba "ya se cargó" y
-- no un "no existe".
-- ---------------------------------------------------------------------

create or replace function limpiar_borradores_vencidos(
  p_comercio_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  delete from borradores_pedido
   where vence_en < now()
     and (p_comercio_id is null or comercio_id = p_comercio_id);

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function limpiar_borradores_vencidos(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. El cliente arma el borrador. La llaman anónimos.
--
-- Valida lo mismo que `crear_pedido_landing` —comercio activo, función
-- habilitada, plan, caja abierta y disponibilidad efectiva de cada
-- producto— con dos diferencias de fondo:
--
--   * el plan tiene que incluir salón (`salon` o `completo`), al revés que
--     la landing, que exige take away;
--   * no pide `comercios.whatsapp`. En la landing es obligatorio porque es
--     el único contacto con el cliente; acá el cliente está sentado en la
--     mesa y el mozo le lleva el pedido en la mano.
--
-- La caja se chequea a mano y no por trigger: este camino no inserta en
-- `pedidos`, así que `asignar_numero_pedido` —que es quien la exige en
-- todos los demás— no corre. `for share`, igual que ese trigger: una caja
-- a medio cerrar no deja armar borradores nuevos.
-- ---------------------------------------------------------------------

create or replace function crear_borrador_qr(
  p_slug  text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comercio      comercios%rowtype;
  v_item          jsonb;
  v_cantidad      int;
  v_nota          text;
  v_prod          record;
  v_adicionales   jsonb;
  v_no_disponible text;
  v_items         jsonb := '[]'::jsonb;
  v_codigo        text;
  v_vence         timestamptz;
  v_intento       int;
begin
  select * into v_comercio from comercios where slug = p_slug;
  if not found
     or v_comercio.estado <> 'activo'
     or v_comercio.plan not in ('salon', 'completo')
     or not v_comercio.qr_mesa_activo then
    raise exception 'Este local no está tomando pedidos desde la mesa';
  end if;

  perform 1 from cajas
   where comercio_id = v_comercio.id and estado = 'abierta'
   for share;
  if not found then
    raise exception 'El local no está tomando pedidos en este momento';
  end if;

  -- En dos pasos: Postgres no garantiza el orden en que evalúa un `or`, y
  -- jsonb_array_length falla si no es un array.
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'El pedido está vacío';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido tiene demasiados productos';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_cantidad not between 1 and 99 then
      raise exception 'Cantidad inválida';
    end if;
    v_nota := nullif(btrim(coalesce(v_item->>'nota', '')), '');
    if length(v_nota) > 140 then
      raise exception 'Una aclaración de producto es demasiado larga';
    end if;

    -- Misma cadena que carta_publica: producto activo y con stock,
    -- categoría activa, sector efectivo activo. Se valida acá para no
    -- dejarle armar un QR con algo que ya no se vende; igual se vuelve a
    -- validar cuando el mozo escanea, que es cuando cuenta.
    select p.id into v_prod
      from productos p
      join categorias c on c.id = p.categoria_id
      join sectores s on s.id = coalesce(p.sector_id, c.sector_id)
     where p.id = (v_item->>'producto_id')::uuid
       and p.comercio_id = v_comercio.id
       and p.activo and not p.sin_stock
       and c.activo
       and s.activo;

    if not found then
      -- El nombre se busca aparte, solo para poder decir cuál fue.
      select nombre into v_no_disponible from productos
       where id = (v_item->>'producto_id')::uuid and comercio_id = v_comercio.id;
      raise exception 'Ya no está disponible: %', coalesce(v_no_disponible, 'un producto del pedido');
    end if;

    -- Los adicionales se guardan ya filtrados a los que ese producto
    -- ofrece de verdad y están activos: lo que no, se cae acá y no viaja
    -- en el borrador.
    select coalesce(jsonb_agg(a.id), '[]'::jsonb) into v_adicionales
      from adicionales a
      join producto_adicionales pa on pa.adicional_id = a.id and pa.producto_id = v_prod.id
     where a.activo
       and a.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_item->'adicionales', '[]')) x);

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'producto_id', v_prod.id,
      'cantidad', v_cantidad,
      'nota', v_nota,
      'adicionales', v_adicionales
    ));
  end loop;

  -- Limpieza oportunista: cada borrador nuevo barre los vencidos de este
  -- mismo local. Sin pg_cron en el proyecto, engancharla al único camino
  -- que hace crecer la tabla es lo que la mantiene chica sola, y el
  -- volumen de borrado acompaña solo al de creación. Se acota al comercio
  -- para que una escritura de un local no tome locks sobre las filas de
  -- otro.
  perform limpiar_borradores_vencidos(v_comercio.id);

  -- 30 minutos. El plazo lo manda el peor caso realista de "ya pedí, falta
  -- que pase el mozo" en un bar lleno; más corto y el QR se le muere en la
  -- mano justo cuando el mozo llega. Más largo no haría falta: la
  -- disponibilidad y los precios se revalidan al escanear, así que lo que
  -- el plazo acota no es la frescura del pedido sino cuánto tiempo puede
  -- un QR olvidado volver a la vida (ej. el cliente que ya pagó y se fue,
  -- y sin querer vuelve a abrir la pestaña). Entra de sobra en una
  -- jornada: si la caja se cierra, el borrador deja de poder convertirse
  -- igual, por el trigger de `pedidos`.
  v_vence := now() + interval '30 minutes';

  -- 40 bits de azar: una colisión es improbable, pero el código es único
  -- en toda la tabla, así que se reintenta en vez de fallarle al cliente.
  for v_intento in 1..5 loop
    begin
      v_codigo := nuevo_codigo_borrador();

      insert into borradores_pedido (comercio_id, codigo, items, vence_en)
      values (v_comercio.id, v_codigo, v_items, v_vence);

      return jsonb_build_object('codigo', v_codigo, 'vence_en', v_vence);
    exception when unique_violation then
      -- Código repetido: se prueba con otro.
    end;
  end loop;

  raise exception 'No se pudo generar el código del pedido. Probá de nuevo.';
end $$;

-- Parte de la API pública: la llama la pantalla del cliente, sin sesión.
revoke execute on function crear_borrador_qr(text, jsonb) from public, anon;
grant execute on function crear_borrador_qr(text, jsonb) to authenticated, anon;

-- ---------------------------------------------------------------------
-- 7. El mozo lo convierte en ronda.
-- ---------------------------------------------------------------------

create or replace function convertir_borrador_qr(
  p_codigo  text,
  p_mesa_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrador  borradores_pedido%rowtype;
  v_mesa      record;
  v_cuenta_id uuid;
  v_abrio     boolean := false;
  v_ronda     jsonb;
begin
  -- `for update`: si dos mozos escanean el mismo QR a la vez, el segundo
  -- espera acá y después lo encuentra ya usado. Un borrador se convierte
  -- en ronda una sola vez.
  select * into v_borrador from borradores_pedido
   where codigo = upper(btrim(coalesce(p_codigo, '')))
   for update;

  if not found then
    raise exception 'Ese código no existe o ya venció';
  end if;

  -- El rol se chequea antes que el estado del borrador: quien no es de
  -- este comercio no se entera de nada sobre él.
  if not tiene_rol(v_borrador.comercio_id, '{duenio,mozo}') then
    raise exception 'No autorizado';
  end if;

  if v_borrador.usado_en is not null then
    raise exception 'Ese pedido ya se cargó en una mesa';
  end if;

  if v_borrador.vence_en <= now() then
    raise exception 'Ese código ya venció: pedile al cliente que lo arme de nuevo';
  end if;

  -- Un borrador puede sobrevivir a una baja de plan. Para el mozo esta
  -- línea es redundante: `tiene_rol` ya lo filtra, porque exige el
  -- comercio activo y `plan_permite_rol` solo habilita el rol `mozo` con
  -- salón. Para el DUEÑO no lo es — a él `plan_permite_rol` lo deja pasar
  -- con cualquier plan —, y sin este chequeo el dueño de un local que
  -- bajó a take away podría seguir cargando rondas de mesa. Verificado
  -- contra la base, no deducido.
  --
  -- El interruptor `qr_mesa_activo`, en cambio, a propósito **no** se
  -- revalida: apagarlo corta los borradores nuevos, no el que un cliente
  -- ya tiene esperando en la mano.
  perform 1 from comercios
   where id = v_borrador.comercio_id
     and estado = 'activo'
     and plan in ('salon', 'completo');
  if not found then
    raise exception 'Este local no está tomando pedidos desde la mesa';
  end if;

  -- Misma regla que abrirCuenta (src/app/app/salon/actions.ts): la mesa
  -- tiene que ser de este comercio, activa y con su zona activa.
  select m.activo, z.activo as zona_activa
    into v_mesa
    from mesas m
    join zonas z on z.id = m.zona_id
   where m.id = p_mesa_id
     and m.comercio_id = v_borrador.comercio_id;

  if not found or not v_mesa.activo or not v_mesa.zona_activa then
    raise exception 'Esa mesa no está disponible';
  end if;

  -- Si la mesa no tiene cuenta abierta, se abre en el mismo gesto. No se
  -- exige haberla abierto uno: en un bar cualquier mozo atiende cualquier
  -- mesa, y `mozo_id` es el registro de quién la abrió, no un permiso.
  select id into v_cuenta_id from cuentas
   where mesa_id = p_mesa_id and estado = 'abierta';

  if not found then
    begin
      -- El trigger `cuentas_exigen_caja` corta si la caja está cerrada.
      insert into cuentas (comercio_id, mesa_id, mozo_id)
      values (v_borrador.comercio_id, p_mesa_id, auth.uid())
      returning id into v_cuenta_id;
      v_abrio := true;
    exception when unique_violation then
      -- Índice `cuenta_abierta_unica`: otro mozo abrió esa misma mesa en
      -- el mismo instante. La ronda entra en la cuenta de él, que es lo
      -- correcto — es la misma mesa.
      select id into v_cuenta_id from cuentas
       where mesa_id = p_mesa_id and estado = 'abierta';
      if not found then
        raise exception 'No se pudo abrir la mesa. Probá de nuevo.';
      end if;
    end;
  end if;

  -- Acá se reusa todo: el bloqueo de la cuenta, el chequeo de rol, la
  -- revalidación de disponibilidad producto por producto y las copias de
  -- nombre, categoría, precio y sector. Entre que el cliente armó el
  -- pedido y el mozo escanea pueden pasar minutos: si algo se acabó, esto
  -- corta con "Ya no está disponible: X" y se cae toda la transacción —la
  -- cuenta recién abierta incluida—, así que no queda nada a medias ni un
  -- borrador marcado como usado sin ronda.
  v_ronda := crear_ronda_en_cuenta(v_cuenta_id, v_borrador.items, 'qr_mesa');

  update borradores_pedido
     set usado_en  = now(),
         pedido_id = (v_ronda->>'pedido_id')::uuid
   where id = v_borrador.id;

  return jsonb_build_object(
    'pedido_id', v_ronda->'pedido_id',
    'numero', v_ronda->'numero',
    'cuenta_id', v_cuenta_id,
    'mesa_abierta_ahora', v_abrio
  );
end $$;

revoke execute on function convertir_borrador_qr(text, uuid) from public, anon;
grant execute on function convertir_borrador_qr(text, uuid) to authenticated;
