-- =====================================================================
-- Landing pública de take away (/{slug}): lo que le falta a la base.
--
-- 1. `comercios.whatsapp`: el número al que el cliente le avisa su pedido
--    al local.
-- 2. `pedidos.codigo_seguimiento` + `seguimiento_pedido()`: el link que el
--    cliente puede volver a abrir para ver cómo va su pedido, sin cuenta
--    ni login.
-- 3. `crear_pedido_landing`: genera ese código y lo devuelve (en vez del
--    id interno del pedido), y valida los datos del cliente. Se puede
--    llamar directo con la clave anónima, que es pública: lo que valida la
--    Server Action de la landing no alcanza, tiene que estar acá adentro.
-- 4. `carta_publica`: suma el WhatsApp del local y deja de devolver el id
--    interno del comercio, que ninguna pantalla usa.
--
-- Una sola migración porque las cuatro piezas son la misma superficie
-- pública (todo lo que puede tocar alguien sin sesión) y conviene leerla
-- junta.
-- =====================================================================

-- 1. WhatsApp del local -------------------------------------------------
-- Solo dígitos, con código de país y sin el "+", que es lo que pide wa.me
-- (5491122334455 para un celular de Buenos Aires). Opcional: sin número,
-- la landing no ofrece el botón.
alter table comercios
  add column whatsapp text,
  add constraint comercios_whatsapp_check check (whatsapp ~ '^[0-9]{8,15}$');

-- 2. Seguimiento --------------------------------------------------------
-- Un uuid al azar (gen_random_uuid: 122 bits de un generador
-- criptográfico), no el número de pedido, que es correlativo y se adivina
-- probando, ni el id del pedido, que circula por las pantallas internas.
-- Solo lo tienen los pedidos de la landing.
alter table pedidos
  add column codigo_seguimiento uuid,
  add constraint pedidos_codigo_seguimiento_key unique (codigo_seguimiento);

-- Lo mínimo para que el cliente vea cómo va su pedido: nada del comercio
-- más allá del nombre, el WhatsApp y la zona horaria (para mostrar la
-- hora bien), ni el teléfono del cliente, ni ids internos. Quien tiene el
-- código ya es el cliente (o alguien a quien él le pasó el link), y aun
-- así:
-- - solo pedidos de la landing (las rondas de mesa no tienen código, pero
--   se filtra igual, explícito);
-- - el slug tiene que coincidir: un código válido con otro slug no trae
--   nada;
-- - comercio activo, como la landing;
-- - el link vence a los 2 días: un link reenviado o que quedó en un
--   historial no expone para siempre el nombre y la dirección del cliente.
create or replace function seguimiento_pedido(
  p_slug   text,
  p_codigo uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'comercio', jsonb_build_object(
      'nombre', c.nombre,
      'whatsapp', c.whatsapp,
      'zona_horaria', c.zona_horaria
    ),
    'numero', p.numero,
    'estado', p.estado,
    'modalidad', p.modalidad,
    'cliente_nombre', p.cliente_nombre,
    'direccion', p.direccion,
    'nota', p.nota,
    'creado_en', p.creado_en,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', i.nombre,
        'categoria_nombre', i.categoria_nombre,
        'precio_unitario', i.precio_unitario,
        'cantidad', i.cantidad,
        'nota', i.nota,
        'estado', i.estado,
        'adicionales', coalesce((
          select jsonb_agg(jsonb_build_object(
            'nombre', a.nombre, 'precio_extra', a.precio_extra
          ) order by a.nombre)
            from pedido_item_adicionales a
           where a.item_id = i.id
        ), '[]'::jsonb)
      ) order by i.categoria_nombre, i.nombre)
        from pedido_items i
       where i.pedido_id = p.id
    ), '[]'::jsonb)
  )
  from pedidos p
  join comercios c on c.id = p.comercio_id
  where p.codigo_seguimiento = p_codigo
    and p.origen = 'landing'
    and c.slug = p_slug
    and c.estado = 'activo'
    and p.creado_en > now() - interval '2 days';
$$;

revoke execute on function seguimiento_pedido(text, uuid) from public, anon;
grant execute on function seguimiento_pedido(text, uuid) to anon, authenticated;

-- 3. crear_pedido_landing -----------------------------------------------
-- Misma firma (los grants se reafirman abajo igual). Cambios:
-- - valida nombre, teléfono, modalidad, dirección y largos — mismos
--   límites que src/lib/landing/validacion.ts;
-- - topes de 50 líneas y 99 unidades por línea, para que nadie meta un
--   pedido absurdo llamando a la función a mano;
-- - con retiro no guarda la dirección aunque llegue;
-- - genera el código de seguimiento y devuelve solo eso y el número;
-- - si un producto ya no está disponible, dice cuál (como crear_pedido_mozo).
-- Los precios, como siempre, salen de la base y no del cliente.
create or replace function crear_pedido_landing (
  p_slug             text,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_modalidad        public.modalidad_pedido,
  p_direccion        text,
  p_nota             text,
  p_items            jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_comercio  comercios%rowtype;
  v_pedido    pedidos%rowtype;
  v_nombre    text := btrim(coalesce(p_cliente_nombre, ''));
  v_telefono  text := btrim(coalesce(p_cliente_telefono, ''));
  v_direccion text := nullif(btrim(coalesce(p_direccion, '')), '');
  v_nota      text := nullif(btrim(coalesce(p_nota, '')), '');
  v_item      jsonb;
  v_cantidad  int;
  v_nota_item text;
  v_prod      record;
  v_item_id   uuid;
  v_no_disponible text;
begin
  select * into v_comercio from comercios where slug = p_slug;
  if not found or v_comercio.estado <> 'activo' or v_comercio.plan = 'salon' then
    raise exception 'Este local no está tomando pedidos online';
  end if;

  if v_nombre = '' or length(v_nombre) > 80 then
    raise exception 'Revisá tu nombre';
  end if;
  if length(v_telefono) > 30
     or length(regexp_replace(v_telefono, '[^0-9]', '', 'g')) not between 8 and 15 then
    raise exception 'Revisá el teléfono';
  end if;
  if p_modalidad is null then
    raise exception 'Elegí si lo retirás o te lo envían';
  end if;
  if p_modalidad = 'retiro' then
    v_direccion := null;
  elsif v_direccion is null then
    raise exception 'Falta la dirección de envío';
  end if;
  if length(v_direccion) > 200 or length(v_nota) > 300 then
    raise exception 'La dirección o la aclaración son demasiado largas';
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

  insert into pedidos (comercio_id, origen, estado, cliente_nombre, cliente_telefono,
                       modalidad, direccion, nota, codigo_seguimiento)
  values (v_comercio.id, 'landing', 'pendiente_confirmar', v_nombre, v_telefono,
          p_modalidad, v_direccion, v_nota, gen_random_uuid())
  returning * into v_pedido;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_cantidad not between 1 and 99 then
      raise exception 'Cantidad inválida';
    end if;
    v_nota_item := nullif(btrim(coalesce(v_item->>'nota', '')), '');
    if length(v_nota_item) > 140 then
      raise exception 'Una aclaración de producto es demasiado larga';
    end if;

    -- Exige toda la cadena activa (producto, categoría, sector efectivo),
    -- igual que carta_publica.
    select p.id, p.nombre, p.precio, c.nombre as categoria_nombre,
           coalesce(p.sector_id, c.sector_id) as sector_id
      into v_prod
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

    insert into pedido_items (comercio_id, pedido_id, producto_id, nombre, categoria_nombre,
                              precio_unitario, cantidad, nota, sector_id)
    values (v_comercio.id, v_pedido.id, v_prod.id, v_prod.nombre, v_prod.categoria_nombre,
            v_prod.precio, v_cantidad, v_nota_item, v_prod.sector_id)
    returning id into v_item_id;

    insert into pedido_item_adicionales (comercio_id, item_id, adicional_id, nombre, precio_extra)
    select v_comercio.id, v_item_id, a.id, a.nombre, a.precio_extra
      from adicionales a
      join producto_adicionales pa on pa.adicional_id = a.id and pa.producto_id = v_prod.id
     where a.activo
       and a.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_item->'adicionales', '[]')) x);
  end loop;

  return jsonb_build_object(
    'numero', v_pedido.numero,
    'codigo_seguimiento', v_pedido.codigo_seguimiento
  );
end $function$;

revoke execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) from public, anon;
grant execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) to anon, authenticated, postgres, service_role;

-- 4. carta_publica ------------------------------------------------------
-- Igual que en 20260923012218, salvo el objeto `comercio`: + whatsapp,
-- − id.
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
    'comercio', jsonb_build_object('nombre', c.nombre, 'plan', c.plan, 'whatsapp', c.whatsapp),
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
