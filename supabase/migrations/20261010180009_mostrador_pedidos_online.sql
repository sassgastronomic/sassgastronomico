-- =====================================================================
-- Mostrador: lo que el local hace con un pedido de la landing.
--
--   pendiente_confirmar ──aceptar──▶ confirmado ──entregar──▶ entregado
--          │  (editar: cantidades,       │
--          │   sacar ítems)              │
--          └──────────cancelar───────────┴──▶ cancelado
--
-- Cuatro funciones, una por acción, en vez de editar la tabla suelta.
-- Todas:
-- - toman el pedido con `for update`: si dos personas tocan el mismo
--   pedido a la vez, la segunda espera y después ve el estado nuevo (y
--   recibe "ya fue aceptado", no un segundo "aceptado");
-- - exigen que quien llama sea dueño o mostrador de ese comercio — el
--   mozo no, aunque los permisos generales de la tabla todavía se lo
--   dejarían (cerrar eso por acción queda para más adelante);
-- - trabajan solo sobre pedidos de la landing: las rondas de salón tienen
--   su propio circuito (mozo, cuentas) y acá no se tocan.
--
-- Aceptar es lo que convierte el pedido online en comanda: cocina muestra
-- solo pedidos `confirmado`, y sus ítems ya tienen el sector desde que se
-- crearon. No se copia nada a ningún lado.
-- =====================================================================

-- Mensaje para un pedido que ya no está en el estado que hacía falta.
create or replace function motivo_estado_pedido(p_estado public.estado_pedido)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_estado
    when 'pendiente_confirmar' then 'Este pedido todavía no fue aceptado'
    when 'confirmado' then 'Este pedido ya fue aceptado'
    when 'entregado' then 'Este pedido ya se entregó'
    when 'cancelado' then 'Este pedido ya fue cancelado'
  end;
$$;

-- Uso interno (ver plazos_seguimiento: Supabase le da EXECUTE directo a
-- `authenticated`, por eso se le saca explícito).
revoke execute on function motivo_estado_pedido(public.estado_pedido) from public, anon, authenticated;

-- Aceptar: pasa a `confirmado` y anota cuándo (`confirmado_en`), que es
-- desde donde cocina cuenta el tiempo de un pedido online.
create or replace function aceptar_pedido_landing(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
begin
  select * into v_pedido from pedidos
   where id = p_pedido_id and origen = 'landing'
   for update;
  if not found then
    raise exception 'No encontramos ese pedido';
  end if;
  if not tiene_rol(v_pedido.comercio_id, '{duenio,mostrador}') then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado <> 'pendiente_confirmar' then
    raise exception '%', motivo_estado_pedido(v_pedido.estado);
  end if;

  update pedidos
     set estado = 'confirmado', confirmado_en = now()
   where id = p_pedido_id;
end;
$$;

revoke execute on function aceptar_pedido_landing(uuid) from public, anon;
grant execute on function aceptar_pedido_landing(uuid) to authenticated;

-- Cancelar: sirve tanto para rechazar un pedido nuevo como para cancelar
-- uno ya aceptado (aceptado por error, cliente que se arrepiente). Sin
-- motivo por ahora. Los ítems quedan como estaban: cocina los deja de
-- mostrar porque solo muestra pedidos `confirmado`.
create or replace function cancelar_pedido_landing(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
begin
  select * into v_pedido from pedidos
   where id = p_pedido_id and origen = 'landing'
   for update;
  if not found then
    raise exception 'No encontramos ese pedido';
  end if;
  if not tiene_rol(v_pedido.comercio_id, '{duenio,mostrador}') then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado not in ('pendiente_confirmar', 'confirmado') then
    raise exception '%', motivo_estado_pedido(v_pedido.estado);
  end if;

  update pedidos
     set estado = 'cancelado', cancelado_en = now()
   where id = p_pedido_id;
end;
$$;

revoke execute on function cancelar_pedido_landing(uuid) from public, anon;
grant execute on function cancelar_pedido_landing(uuid) to authenticated;

-- Editar antes de aceptar: cambia la cantidad de un ítem, o lo saca con
-- cantidad 0. Una vez aceptado ya no se edita (si hace falta un cambio,
-- se habla con el cliente). El último ítem no se puede sacar: para eso
-- está rechazar el pedido. Al sacar un ítem, sus adicionales se van con
-- él (la FK es on delete cascade).
create or replace function cambiar_item_pedido_landing(p_item_id uuid, p_cantidad int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_pedido    pedidos%rowtype;
begin
  select pedido_id into v_pedido_id from pedido_items where id = p_item_id;
  if not found then
    raise exception 'Ese producto ya no está en el pedido';
  end if;

  -- El pedido primero (es lo que serializa a quienes lo tocan), y después
  -- se vuelve a mirar el ítem: pudo haberlo sacado otro mientras tanto.
  select * into v_pedido from pedidos
   where id = v_pedido_id and origen = 'landing'
   for update;
  if not found then
    raise exception 'No encontramos ese pedido';
  end if;
  if not tiene_rol(v_pedido.comercio_id, '{duenio,mostrador}') then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado <> 'pendiente_confirmar' then
    raise exception '%: ya no se puede editar', motivo_estado_pedido(v_pedido.estado);
  end if;
  perform 1 from pedido_items where id = p_item_id for update;
  if not found then
    raise exception 'Ese producto ya no está en el pedido';
  end if;
  if p_cantidad is null or p_cantidad not between 0 and 99 then
    raise exception 'Cantidad inválida';
  end if;

  if p_cantidad = 0 then
    if (select count(*) from pedido_items where pedido_id = v_pedido.id) <= 1 then
      raise exception 'Es el único producto del pedido: para sacarlo, rechazá el pedido';
    end if;
    delete from pedido_items where id = p_item_id;
  else
    update pedido_items set cantidad = p_cantidad where id = p_item_id;
  end if;
end;
$$;

revoke execute on function cambiar_item_pedido_landing(uuid, int) from public, anon;
grant execute on function cambiar_item_pedido_landing(uuid, int) to authenticated;

-- Entregar (take away): todo junto, cuando cocina ya terminó todo. Marca
-- los ítems `entregado` con su hora; el trigger `item_entregado`
-- (cerrar_pedido_si_completo) pasa el pedido a `entregado` solo, igual que
-- en salón. Esa hora es también desde donde corre el rato que el link de
-- seguimiento sigue andando (plazos_seguimiento).
create or replace function entregar_pedido_landing(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos%rowtype;
begin
  select * into v_pedido from pedidos
   where id = p_pedido_id and origen = 'landing'
   for update;
  if not found then
    raise exception 'No encontramos ese pedido';
  end if;
  if not tiene_rol(v_pedido.comercio_id, '{duenio,mostrador}') then
    raise exception 'No autorizado';
  end if;
  if v_pedido.estado <> 'confirmado' then
    raise exception '%', motivo_estado_pedido(v_pedido.estado);
  end if;

  -- Los ítems también se bloquean: así cocina no puede volver uno a "en
  -- preparación" entre que se revisa y se entrega.
  perform 1 from pedido_items where pedido_id = p_pedido_id for update;
  if exists (
    select 1 from pedido_items
     where pedido_id = p_pedido_id and estado not in ('listo', 'entregado')
  ) then
    raise exception 'Cocina todavía no terminó todo el pedido';
  end if;

  update pedido_items
     set estado = 'entregado', entregado_en = now()
   where pedido_id = p_pedido_id and estado = 'listo';
end;
$$;

revoke execute on function entregar_pedido_landing(uuid) from public, anon;
grant execute on function entregar_pedido_landing(uuid) to authenticated;
