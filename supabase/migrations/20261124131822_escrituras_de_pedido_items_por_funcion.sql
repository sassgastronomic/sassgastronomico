-- Las dos escrituras directas que quedaban en `pedido_items` pasan a
-- funciones, y la tabla se queda sin escritura directa para nadie.
--
-- Viene de la tanda anterior (20261122233742), que angostó las políticas a
-- lo mínimo que la app usaba. Eso dejó dos cosas abiertas, medidas contra
-- la base: con `update` sobre pedido_items, un mozo podía marcar
-- `entregado` un ítem de take away —que no es de ninguna de sus mesas— y
-- saltar `pendiente -> entregado` sin que cocina lo tocara. Las dos son la
-- misma limitación: una política filtra filas, no columnas ni
-- transiciones de estado. Eso solo se arregla moviendo la escritura
-- adentro.
--
-- Con esto las cuatro tablas de pedidos y cuentas quedan así:
--
--   pedidos                  -> sin escritura directa
--   pedido_item_adicionales  -> sin escritura directa
--   pedido_items             -> sin escritura directa  (esta migración)
--   cuentas                  -> insert (abrir una mesa)
--
-- Las dos funciones nuevas siguen el molde de las que ya están
-- (entregar_pedido_landing, cerrar_cuenta): `security definer` con
-- `search_path` fijo, el candado de rol adentro, lo que se toca bloqueado
-- mientras se trabaja, y execute solo para `authenticated`.

-- 1. Salón: el mozo entrega ----------------------------------------------
-- La gemela exacta de entregar_pedido_landing, para mesas. Con p_item_id
-- entrega ese ítem; sin él, todo lo que esté listo en la mesa (el botón
-- "entregar todo"). Devuelve cuántos ítems entregó.
--
-- Lo que esto impone y antes vivía solo en la app: que el ítem sea de un
-- pedido confirmado *de esa cuenta* —por eso ya no se puede entregar algo
-- de take away— y que esté `listo`, así no hay salto de estados. El pedido
-- pasa a `entregado` solo, por el trigger item_entregado.
--
-- Cualquier mozo entrega en cualquier mesa, como en cualquier bar: la
-- condición es el comercio de la cuenta, no quién la abrió.
create or replace function entregar_items_cuenta(
  p_cuenta_id uuid,
  p_item_id   uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta cuentas%rowtype;
  v_n      int;
begin
  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'No se encontró la cuenta';
  end if;

  if not tiene_rol(v_cuenta.comercio_id, '{duenio,mozo}') then
    raise exception 'No autorizado';
  end if;

  if v_cuenta.estado <> 'abierta' then
    raise exception 'Esa mesa ya está cerrada';
  end if;

  update pedido_items i
     set estado = 'entregado', entregado_en = now()
   where i.estado = 'listo'
     and (p_item_id is null or i.id = p_item_id)
     and exists (
       select 1 from pedidos p
        where p.id = i.pedido_id
          and p.cuenta_id = p_cuenta_id
          and p.estado = 'confirmado'
     );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function entregar_items_cuenta(uuid, uuid) from public, anon;
grant execute on function entregar_items_cuenta(uuid, uuid) to authenticated;

-- 2. Cocina: avanzar y retroceder ----------------------------------------
-- Un solo punto de entrada para la pantalla de sector. `p_avanzar` dice
-- para qué lado, y el destino lo calcula la base: el que llama no lo
-- elige, que es justo lo que cierra el salto de estados.
--
--   avanzar:    pendiente -> en_preparacion -> listo
--   retroceder: listo -> en_preparacion  (de a un ítem, como en la
--               pantalla: la solapa de listos es el único lugar donde se
--               puede volver atrás)
--
-- Con p_item_id va un ítem; con p_pedido_id, todos los de ese pedido en
-- este sector (el botón que avanza el pedido entero). Devuelve cuántos
-- cambió.
--
-- Permiso: dueño en cualquier sector, o rol `sector` con este sector
-- asignado — el mismo criterio que puedeOperarEnSector en
-- src/app/app/sector/[id]/actions.ts, ahora también abajo.
--
-- Y solo ítems de pedidos `confirmado`, que es exactamente lo que lista la
-- pantalla: un pedido online sin aceptar todavía no se cocina.
create or replace function cambiar_estado_item_sector(
  p_sector_id uuid,
  p_avanzar   boolean,
  p_item_id   uuid default null,
  p_pedido_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comercio uuid;
  v_n        int;
begin
  if (p_item_id is null) = (p_pedido_id is null) then
    raise exception 'Hay que indicar un ítem o un pedido, no los dos ni ninguno';
  end if;

  if not p_avanzar and p_item_id is null then
    raise exception 'Retroceder es de a un ítem';
  end if;

  select comercio_id into v_comercio from sectores where id = p_sector_id;
  if not found then
    raise exception 'No se encontró el sector';
  end if;

  if not (
    tiene_rol(v_comercio, '{duenio}')
    or (
      tiene_rol(v_comercio, '{sector}')
      and exists (
        select 1
          from miembro_sectores ms
          join miembros m on m.id = ms.miembro_id
         where ms.sector_id = p_sector_id
           and m.perfil_id = auth.uid()
           and m.activo
      )
    )
  ) then
    raise exception 'No autorizado';
  end if;

  if p_avanzar then
    -- Un solo update, y cada fila que toca avanza exactamente un paso: un
    -- update visita cada fila una vez, así que nada puede saltar de
    -- `pendiente` a `listo` de un toque. (Antes eran dos updates en orden
    -- inverso, justamente para evitar eso.)
    update pedido_items i
       set estado = case i.estado
                      when 'pendiente' then 'en_preparacion'::estado_item
                      else 'listo'::estado_item
                    end,
           listo_en = case
                        when i.estado = 'en_preparacion' then now()
                        else i.listo_en
                      end
     where i.sector_id = p_sector_id
       and i.comercio_id = v_comercio
       and i.estado in ('pendiente', 'en_preparacion')
       and (p_item_id is null or i.id = p_item_id)
       and (p_pedido_id is null or i.pedido_id = p_pedido_id)
       and exists (
         select 1 from pedidos p
          where p.id = i.pedido_id and p.estado = 'confirmado'
       );
  else
    update pedido_items i
       set estado = 'en_preparacion', listo_en = null
     where i.id = p_item_id
       and i.sector_id = p_sector_id
       and i.comercio_id = v_comercio
       and i.estado = 'listo'
       and exists (
         select 1 from pedidos p
          where p.id = i.pedido_id and p.estado = 'confirmado'
       );
  end if;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function cambiar_estado_item_sector(uuid, boolean, uuid, uuid)
  from public, anon;
grant execute on function cambiar_estado_item_sector(uuid, boolean, uuid, uuid)
  to authenticated;

-- 3. Y se va la escritura directa ----------------------------------------
-- `pedido_items_escribir` (update de dueño y mozo) la reemplaza
-- entregar_items_cuenta; `items_sector` (update del rol sector en sus
-- sectores), cambiar_estado_item_sector. Quedan pedido_items_leer para las
-- pantallas y pedido_items_admin para el soporte de la plataforma.
--
-- Las funciones que ya escribían en esta tabla no se ven afectadas: son
-- security definer y nunca miraron estas políticas
-- (crear_pedido_landing, crear_pedido_mozo, cambiar_item_pedido_landing,
-- entregar_pedido_landing).
drop policy pedido_items_escribir on pedido_items;
drop policy items_sector on pedido_items;
