"use server";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoItem } from "@/types/database";

// Solo estos dos pasos importan acá: 'listo' -> 'entregado' lo maneja otra
// pantalla (se lo entrega el mozo), no esta.
const SIGUIENTE_ESTADO: Partial<Record<EstadoItem, EstadoItem>> = {
  pendiente: "en_preparacion",
  en_preparacion: "listo",
};

/**
 * Dueño (cualquier sector) o rol `sector` con este sector puntual
 * asignado — mismo criterio de acceso que la página
 * (src/app/app/sector/[id]/page.tsx), revalidado acá porque una Server
 * Action es su propio endpoint y no depende de haber pasado por ahí.
 */
async function puedeOperarEnSector(
  sectorId: string,
): Promise<{ ok: true; comercioId: string } | { ok: false }> {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") return { ok: false };
  if (contexto.rol === "duenio") {
    return { ok: true, comercioId: contexto.comercio.id };
  }
  if (
    contexto.rol === "sector" &&
    contexto.sectoresAsignados.some((sector) => sector.id === sectorId)
  ) {
    return { ok: true, comercioId: contexto.comercio.id };
  }
  return { ok: false };
}

// Sin `revalidatePath`: la pantalla de sector se actualiza sola vía la
// suscripción de Realtime (ver pantalla-sector.tsx), que además la
// dispara para todas las pantallas abiertas del sector, no solo la que
// hizo el cambio — revalidatePath acá sería redundante con eso.

/**
 * Avanza un ítem un paso (pendiente -> en preparación -> listo). No hace
 * nada si el ítem no existe en este sector/comercio, o si ya está en
 * 'listo'/'entregado' (no hay paso siguiente que este botón maneje).
 */
export async function avanzarItem(
  itemId: string,
  sectorId: string,
): Promise<void> {
  const autorizacion = await puedeOperarEnSector(sectorId);
  if (!autorizacion.ok) return;

  const supabase = await crearClienteServidor();

  const { data: item } = await supabase
    .from("pedido_items")
    .select("estado")
    .eq("id", itemId)
    .eq("sector_id", sectorId)
    .eq("comercio_id", autorizacion.comercioId)
    .maybeSingle();

  if (!item) return;

  const siguiente = SIGUIENTE_ESTADO[item.estado];
  if (!siguiente) return;

  await supabase
    .from("pedido_items")
    .update(
      siguiente === "listo"
        ? { estado: siguiente, listo_en: new Date().toISOString() }
        : { estado: siguiente },
    )
    .eq("id", itemId)
    .eq("sector_id", sectorId)
    .eq("comercio_id", autorizacion.comercioId);
}

/**
 * Avanza todos los ítems de un pedido (en este sector) un paso cada uno.
 * El orden de los dos updates importa: primero en_preparacion -> listo, y
 * recién después pendiente -> en_preparacion — así ningún ítem pendiente
 * salta directo a listo de un solo toque.
 */
export async function avanzarPedido(
  pedidoId: string,
  sectorId: string,
): Promise<void> {
  const autorizacion = await puedeOperarEnSector(sectorId);
  if (!autorizacion.ok) return;

  const supabase = await crearClienteServidor();

  await supabase
    .from("pedido_items")
    .update({ estado: "listo", listo_en: new Date().toISOString() })
    .eq("pedido_id", pedidoId)
    .eq("sector_id", sectorId)
    .eq("comercio_id", autorizacion.comercioId)
    .eq("estado", "en_preparacion");

  await supabase
    .from("pedido_items")
    .update({ estado: "en_preparacion" })
    .eq("pedido_id", pedidoId)
    .eq("sector_id", sectorId)
    .eq("comercio_id", autorizacion.comercioId)
    .eq("estado", "pendiente");
}

/**
 * Corrige un ítem marcado 'listo' por error, devolviéndolo a "en
 * preparación" — la solapa de ítems listos es, a propósito, el único
 * lugar de esta pantalla donde se puede retroceder (ver la tarea).
 */
export async function retrocederItem(
  itemId: string,
  sectorId: string,
): Promise<void> {
  const autorizacion = await puedeOperarEnSector(sectorId);
  if (!autorizacion.ok) return;

  const supabase = await crearClienteServidor();

  await supabase
    .from("pedido_items")
    .update({ estado: "en_preparacion", listo_en: null })
    .eq("id", itemId)
    .eq("sector_id", sectorId)
    .eq("comercio_id", autorizacion.comercioId)
    .eq("estado", "listo");
}
