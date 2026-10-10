"use server";

import { revalidatePath } from "next/cache";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteTakeAway } from "@/lib/comercios/validacion";
import { LIMITES_PEDIDO, esUuid } from "@/lib/landing/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type ResultadoAccionPedido = { ok: true } | { ok: false; error: string };

const ERROR_GENERICO =
  "No se pudo hacer el cambio. Revisá la conexión y probá de nuevo.";

/**
 * Acciones del mostrador sobre un pedido de la landing. Cada una revalida
 * por su cuenta (rol dueño o mostrador, plan con take away), sin depender
 * de la página: una Server Action es su propio endpoint. Igual, quien
 * manda es la función de la base de cada acción, que vuelve a validar rol,
 * estado y origen adentro y bloquea el pedido mientras trabaja (ver
 * supabase/migrations/…_mostrador_pedidos_online.sql): si dos personas
 * aceptan a la vez, la segunda recibe "Este pedido ya fue aceptado".
 */
async function puedeOperar(): Promise<boolean> {
  const contexto = await obtenerContextoComercio();
  return (
    contexto.tipo === "activo" &&
    (contexto.rol === "duenio" || contexto.rol === "mostrador") &&
    planPermiteTakeAway(contexto.comercio.plan)
  );
}

// P0001 = `raise exception` de la función: mensajes escritos para
// mostrarse tal cual ("Este pedido ya fue aceptado"). Cualquier otro error
// es técnico y no se muestra crudo.
function resultado(
  error: { code: string; message: string } | null,
): ResultadoAccionPedido {
  revalidatePath("/app/pedidos");
  if (!error) return { ok: true };
  if (error.code === "P0001") return { ok: false, error: error.message };
  console.error("[mostrador]", error);
  return { ok: false, error: ERROR_GENERICO };
}

export async function aceptarPedido(
  pedidoId: string,
): Promise<ResultadoAccionPedido> {
  if (!esUuid(pedidoId) || !(await puedeOperar())) {
    return { ok: false, error: "No autorizado" };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aceptar_pedido_landing", {
    p_pedido_id: pedidoId,
  });
  return resultado(error);
}

// Rechazar (pedido nuevo) y cancelar (ya aceptado) son lo mismo en la
// base: el pedido pasa a `cancelado`. Sin motivo por ahora.
export async function cancelarPedido(
  pedidoId: string,
): Promise<ResultadoAccionPedido> {
  if (!esUuid(pedidoId) || !(await puedeOperar())) {
    return { ok: false, error: "No autorizado" };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cancelar_pedido_landing", {
    p_pedido_id: pedidoId,
  });
  return resultado(error);
}

export async function entregarPedido(
  pedidoId: string,
): Promise<ResultadoAccionPedido> {
  if (!esUuid(pedidoId) || !(await puedeOperar())) {
    return { ok: false, error: "No autorizado" };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("entregar_pedido_landing", {
    p_pedido_id: pedidoId,
  });
  return resultado(error);
}

// Solo antes de aceptar. Cantidad 0 = sacar el ítem (la base no deja
// sacar el último: para eso está rechazar).
export async function cambiarCantidadItem(
  itemId: string,
  cantidad: number,
): Promise<ResultadoAccionPedido> {
  if (
    !Number.isInteger(cantidad) ||
    cantidad < 0 ||
    cantidad > LIMITES_PEDIDO.cantidad
  ) {
    return { ok: false, error: "Cantidad inválida" };
  }
  if (!esUuid(itemId) || !(await puedeOperar())) {
    return { ok: false, error: "No autorizado" };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_item_pedido_landing", {
    p_item_id: itemId,
    p_cantidad: cantidad,
  });
  return resultado(error);
}
