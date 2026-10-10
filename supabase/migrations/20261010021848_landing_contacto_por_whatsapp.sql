-- =====================================================================
-- Landing: el contacto con el cliente pasa a ser por WhatsApp.
--
-- El cliente ya no deja su teléfono: al confirmar, se le abre WhatsApp
-- con el pedido escrito, y el chat que inicia es el canal con el local.
-- El link de seguimiento ya no se le da al confirmar: se lo manda el
-- mostrador por ese chat cuando acepta el pedido.
--
-- 1. crear_pedido_landing:
--    - el teléfono pasa a ser opcional (si llega, se valida igual que
--      antes; la columna `pedidos.cliente_telefono` queda: los pedidos
--      viejos lo tienen);
--    - sin WhatsApp cargado, el local no toma pedidos: no habría ninguna
--      forma de contactar al cliente;
--    - devuelve el número y el detalle tal como quedó guardado (con los
--      precios de la base), para armar el mensaje; ya no devuelve el
--      código de seguimiento, que ahora solo ve el local.
-- 2. seguimiento_pedido: el link vence a las 24 horas, no a los 2 días.
--    Ahora vive en el chat de WhatsApp del cliente (no se pierde, se
--    puede reenviar o encontrar días después), y un pedido de take away
--    se resuelve en el día: 24 horas cubren de sobra cualquier pedido
--    del día, hasta uno hecho a la mañana para retirar a la noche.
-- =====================================================================

-- 1. crear_pedido_landing -----------------------------------------------
-- Misma firma: los grants se mantienen (y se reafirman abajo).
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
  -- El detalle se arma en el orden en que llegó (el del carrito): es lo
  -- que el cliente va a ver escrito en el mensaje.
  v_items     jsonb := '[]'::jsonb;
begin
  select * into v_comercio from comercios where slug = p_slug;
  if not found or v_comercio.estado <> 'activo' or v_comercio.plan = 'salon'
     or v_comercio.whatsapp is null then
    raise exception 'Este local no está tomando pedidos online';
  end if;

  if v_nombre = '' or length(v_nombre) > 80 then
    raise exception 'Revisá tu nombre';
  end if;
  if v_telefono <> ''
     and (length(v_telefono) > 30
          or length(regexp_replace(v_telefono, '[^0-9]', '', 'g')) not between 8 and 15) then
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
  values (v_comercio.id, 'landing', 'pendiente_confirmar', v_nombre, nullif(v_telefono, ''),
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

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'nombre', v_prod.nombre,
      'categoria_nombre', v_prod.categoria_nombre,
      'precio_unitario', v_prod.precio,
      'cantidad', v_cantidad,
      'nota', v_nota_item,
      'adicionales', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nombre', a.nombre, 'precio_extra', a.precio_extra
        ) order by a.nombre)
          from pedido_item_adicionales a
         where a.item_id = v_item_id
      ), '[]'::jsonb)
    ));
  end loop;

  return jsonb_build_object('numero', v_pedido.numero, 'items', v_items);
end $function$;

revoke execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) from public, anon;
grant execute on function crear_pedido_landing(text, text, text, public.modalidad_pedido, text, text, jsonb) to anon, authenticated, postgres, service_role;

-- 2. seguimiento_pedido -------------------------------------------------
-- Igual que en 20261010005433, salvo el vencimiento: 24 horas.
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
    and p.creado_en > now() - interval '24 hours';
$$;

revoke execute on function seguimiento_pedido(text, uuid) from public, anon;
grant execute on function seguimiento_pedido(text, uuid) to anon, authenticated;
