"use server";

import { revalidatePath } from "next/cache";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { esUuid } from "@/lib/landing/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { PendientesCaja } from "@/types/database";

export type ResultadoAbrirCaja = { ok: true } | { ok: false; error: string };

export type ResultadoCerrarCaja =
  | { tipo: "cerrada"; reactivados: number }
  | { tipo: "pendientes"; pendientes: PendientesCaja }
  | { tipo: "error"; error: string };

const ERROR_GENERICO = "No se pudo hacer. Revisá la conexión y probá de nuevo.";

/**
 * Abrir y cerrar la caja: dueño y mostrador. Cada acción revalida el rol
 * por su cuenta, pero quien manda es la función de la base (abrir_caja,
 * cerrar_caja), que lo vuelve a validar adentro junto con las reglas: una
 * sola caja abierta, no abrir si quedó abierta la de una jornada anterior,
 * no cerrar con mesas abiertas o pedidos sin entregar.
 *
 * Cambiar la caja cambia lo que muestran el mostrador, el salón y la
 * landing: se revalidan las tres (además, el salón y el mostrador se
 * enteran en vivo).
 */
async function comercioSiPuedeOperar(): Promise<string | null> {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") return null;
  if (contexto.rol !== "duenio" && contexto.rol !== "mostrador") return null;
  return contexto.comercio.id;
}

function revalidarPantallas() {
  revalidatePath("/app/caja");
  revalidatePath("/app/pedidos");
  revalidatePath("/app/salon");
}

export async function abrirCaja(): Promise<ResultadoAbrirCaja> {
  const comercioId = await comercioSiPuedeOperar();
  if (!comercioId) return { ok: false, error: "No autorizado" };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("abrir_caja", {
    p_comercio_id: comercioId,
  });
  revalidarPantallas();
  if (!error) return { ok: true };
  // P0001: mensajes de la función, escritos para mostrarse tal cual. 23505:
  // dos personas abrieron a la vez y el índice único dejó entrar a una sola.
  if (error.code === "P0001") return { ok: false, error: error.message };
  if (error.code === "23505") {
    return { ok: false, error: "La caja ya está abierta" };
  }
  console.error("[caja] abrir_caja:", error);
  return { ok: false, error: ERROR_GENERICO };
}

export async function cerrarCaja(cajaId: string): Promise<ResultadoCerrarCaja> {
  if (!esUuid(cajaId)) return { tipo: "error", error: "No autorizado" };
  const comercioId = await comercioSiPuedeOperar();
  if (!comercioId) return { tipo: "error", error: "No autorizado" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("cerrar_caja", {
    p_caja_id: cajaId,
  });
  revalidarPantallas();
  if (error || !data) {
    if (error?.code === "P0001") return { tipo: "error", error: error.message };
    console.error("[caja] cerrar_caja:", error);
    return { tipo: "error", error: ERROR_GENERICO };
  }
  if (!data.ok) return { tipo: "pendientes", pendientes: data.pendientes };
  return { tipo: "cerrada", reactivados: data.reactivados };
}
