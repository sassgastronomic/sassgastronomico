-- ---------------------------------------------------------------------
-- La pantalla del mozo lee el borrador antes de cargarlo.
--
-- `borradores_pedido.items` guarda ids pelados (producto, adicionales) y
-- cantidades: es lo que necesita `crear_ronda_en_cuenta` y nada más. El
-- mozo, en cambio, tiene que poder leer en voz alta lo que pidió el
-- cliente, así que hace falta resolver nombres, categoría, precios y
-- —sobre todo— disponibilidad del momento.
--
-- Por qué una función y no una policy de SELECT sobre `borradores_pedido`:
--
--   * una policy devolvería los ids crudos, y la pantalla tendría que
--     salir a buscar productos y adicionales por separado, repitiendo en
--     TypeScript la cadena producto -> categoría -> sector efectivo que ya
--     vive en la base (y que es la que de verdad decide si la carga entra);
--   * además habilitaría listar la tabla entera del comercio. Con la
--     función, al mozo solo le llega el borrador cuyo código tiene en la
--     mano, que es exactamente lo que el QR le dio.
--
-- No escribe nada: `stable`, igual que `carta_publica` y las demás de
-- lectura del proyecto.
--
-- La disponibilidad que informa es la MISMA cadena que revalida
-- `crear_ronda_en_cuenta` al convertir. Eso es el punto de toda la
-- función: que el mozo vea el problema antes de tocar el botón, y no se
-- entere por un error después de haberle dicho al cliente que ya está.
-- ---------------------------------------------------------------------

create or replace function leer_borrador_qr(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_borrador   borradores_pedido%rowtype;
  v_item       jsonb;
  v_prod       record;
  v_cargado    record;
  v_adicionales jsonb;
  v_extra      numeric;
  v_elegidos   int;
  v_cantidad   int;
  v_subtotal   numeric;
  v_total      numeric := 0;
  v_items      jsonb := '[]'::jsonb;
  v_faltantes  boolean := false;
  v_estado     text;
  v_donde      jsonb := null;
begin
  -- Mismo normalizado que `convertir_borrador_qr`: el mozo puede haber
  -- tipeado el código a mano (en minúscula, con un espacio pegado) en vez
  -- de escanearlo.
  select * into v_borrador from borradores_pedido
   where codigo = upper(btrim(coalesce(p_codigo, '')));

  -- Un código que no existe y un código de otro local se contestan igual,
  -- con null: quien no atiende en ese comercio no se entera ni de que
  -- existe. Mismo orden que `convertir_borrador_qr`, donde el rol se
  -- chequea antes de mirar el estado del borrador.
  if not found or not tiene_rol(v_borrador.comercio_id, '{duenio,mozo}') then
    return null;
  end if;

  -- El estado lo decide la base, no la pantalla: son las mismas tres
  -- condiciones, en el mismo orden, que corta `convertir_borrador_qr`.
  -- "Usado" va primero porque es el caso que hay que explicar bien (el
  -- mozo acaba de escanear un QR que ya cargó, o lo escanearon dos).
  if v_borrador.usado_en is not null then
    v_estado := 'usado';
  elsif v_borrador.vence_en <= now() then
    v_estado := 'vencido';
  else
    v_estado := 'vigente';
  end if;

  -- "Ya lo cargaste, es la ronda #N": con el número de la ronda y la mesa
  -- donde entró, para que el mozo pueda ir a verla en vez de quedarse con
  -- un "ya se usó" pelado. `pedido_id` puede ser null si el pedido se
  -- borró (cascada); en ese caso se informa el estado igual, sin el dónde.
  if v_borrador.pedido_id is not null then
    select pe.numero, m.id as mesa_id, m.nombre as mesa_nombre
      into v_cargado
      from pedidos pe
      left join cuentas cu on cu.id = pe.cuenta_id
      left join mesas m on m.id = cu.mesa_id
     where pe.id = v_borrador.pedido_id;

    if found then
      v_donde := jsonb_build_object(
        'pedido_numero', v_cargado.numero,
        'mesa_id', v_cargado.mesa_id,
        'mesa_nombre', v_cargado.mesa_nombre,
        'usado_en', v_borrador.usado_en
      );
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(v_borrador.items) loop
    -- Igual que `crear_ronda_en_cuenta`: una cantidad rara se lee como 1.
    v_cantidad := greatest(coalesce((v_item->>'cantidad')::int, 1), 1);

    -- A diferencia de la conversión, acá los filtros de disponibilidad NO
    -- van en el `where`: la línea tiene que aparecer igual, marcada, para
    -- que el mozo sepa cuál es el problema. `disponible` se calcula como
    -- columna, con la misma cadena (producto activo y con stock, categoría
    -- activa, sector efectivo activo). Los join son `left` para que un
    -- producto al que le falta la categoría o el sector salga "no
    -- disponible" en vez de desaparecer de la lista.
    select p.nombre,
           p.precio,
           c.nombre as categoria_nombre,
           (p.activo
            and not p.sin_stock
            and coalesce(c.activo, false)
            and coalesce(s.activo, false)) as disponible
      into v_prod
      from productos p
      left join categorias c on c.id = p.categoria_id
      left join sectores s on s.id = coalesce(p.sector_id, c.sector_id)
     where p.id = (v_item->>'producto_id')::uuid
       and p.comercio_id = v_borrador.comercio_id;

    if not found then
      -- El producto ya no está en la tabla. No hay precio que mostrar, y
      -- la carga va a fallar igual: se informa como línea no disponible.
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'producto_id', v_item->>'producto_id',
        'nombre', null,
        'categoria_nombre', null,
        'precio', 0,
        'cantidad', v_cantidad,
        'nota', nullif(btrim(coalesce(v_item->>'nota', '')), ''),
        'disponible', false,
        'adicionales', '[]'::jsonb,
        'adicionales_caidos', 0,
        'subtotal', 0
      ));
      v_faltantes := true;
      continue;
    end if;

    if not v_prod.disponible then
      v_faltantes := true;
    end if;

    -- Los adicionales se resuelven con el mismo filtro que los copia la
    -- conversión: activos y que ese producto siga ofreciendo.
    select coalesce(
             jsonb_agg(
               jsonb_build_object('nombre', a.nombre, 'precio_extra', a.precio_extra)
               order by a.nombre
             ),
             '[]'::jsonb
           ),
           coalesce(sum(a.precio_extra), 0)
      into v_adicionales, v_extra
      from adicionales a
      join producto_adicionales pa
        on pa.adicional_id = a.id
       and pa.producto_id = (v_item->>'producto_id')::uuid
     where a.activo
       and a.id in (
         select (x)::uuid
           from jsonb_array_elements_text(coalesce(v_item->'adicionales', '[]')) x
       );

    -- Cuántos de los que eligió el cliente ya no aplican (se desactivaron,
    -- o se los sacaron al producto). Esto **no** hace fallar la carga:
    -- `crear_ronda_en_cuenta` los filtra con este mismo criterio y copia
    -- los que quedan. Por eso no cuenta como "no disponible" — se informa
    -- aparte, para que el mozo pueda avisarle al cliente que esa línea va
    -- a entrar sin el agregado.
    v_elegidos := jsonb_array_length(coalesce(v_item->'adicionales', '[]'));

    v_subtotal := v_cantidad * (v_prod.precio + v_extra);
    v_total := v_total + v_subtotal;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'producto_id', v_item->>'producto_id',
      'nombre', v_prod.nombre,
      'categoria_nombre', v_prod.categoria_nombre,
      'precio', v_prod.precio,
      'cantidad', v_cantidad,
      'nota', nullif(btrim(coalesce(v_item->>'nota', '')), ''),
      'disponible', v_prod.disponible,
      'adicionales', v_adicionales,
      'adicionales_caidos', greatest(v_elegidos - jsonb_array_length(v_adicionales), 0),
      'subtotal', v_subtotal
    ));
  end loop;

  return jsonb_build_object(
    -- Para que la pantalla pueda cortar si el borrador es de OTRO comercio
    -- del mismo usuario: `tiene_rol` mira cualquier membresía activa, pero
    -- la app entra a un comercio a la vez (ver src/lib/comercio/contexto.ts),
    -- y la lista de mesas y la conversión son de ese.
    'comercio_id', v_borrador.comercio_id,
    'codigo', v_borrador.codigo,
    'estado', v_estado,
    'creado_en', v_borrador.creado_en,
    'vence_en', v_borrador.vence_en,
    'items', v_items,
    -- El precio de hoy, no el de cuando el cliente armó el pedido: es el
    -- que va a quedar copiado en `pedido_items` al convertir.
    'total', v_total,
    -- Si hay alguna línea en false, la conversión entera va a fallar
    -- (`crear_ronda_en_cuenta` es todo o nada). La pantalla lo usa para no
    -- ofrecer un botón que no puede funcionar.
    'hay_no_disponibles', v_faltantes,
    'cargado', v_donde
  );
end $$;

-- La llama la pantalla del mozo, que está logueada. Nunca un anónimo: el
-- código del QR es la credencial del CLIENTE para volver a ver su propio
-- QR (eso vive en su localStorage), no para leer el pedido desde afuera.
revoke execute on function leer_borrador_qr(text) from public, anon;
grant execute on function leer_borrador_qr(text) to authenticated;
