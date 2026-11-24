"use server";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Dueño (cualquier sector) o rol `sector` con este sector puntual
 * asignado — mismo criterio de acceso que la página
 * (src/app/app/sector/[id]/page.tsx).
 *
 * Es el primer filtro barato, para no gastar una llamada a la base: el
 * mismo criterio lo revalida adentro `cambiar_estado_item_sector` (ver
 * supabase/migrations/), que es donde cuenta.
 */
async function puedeOperarEnSector(sectorId: string): Promise<boolean> {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") return false;
  if (contexto.rol === "duenio") return true;
  return (
    contexto.rol === "sector" &&
    contexto.sectoresAsignados.some((sector) => sector.id === sectorId)
  );
}

// Sin `revalidatePath`: la pantalla de sector se actualiza sola vía la
// suscripción de Realtime (ver pantalla-sector.tsx), que además la
// dispara para todas las pantallas abiertas del sector, no solo la que
// hizo el cambio — revalidatePath acá sería redundante con eso.

/**
 * Las tres acciones de esta pantalla son la misma función de la base,
 * `cambiar_estado_item_sector`, que decide *ella* el estado destino:
 * avanzar es pendiente -> en preparación -> listo, y retroceder es listo
 * -> en preparación. Desde acá no se manda ningún estado, así que no hay
 * forma de saltear un paso ni de marcar algo `entregado` (eso es del
 * mozo, en otra pantalla).
 *
 * La función valida adentro el rol y el sector, que el ítem sea de este
 * sector y que su pedido esté confirmado —lo mismo que lista la pantalla—.
 * Si no había nada que cambiar devuelve 0 y no pasa nada: no hay error
 * que mostrar.
 */

/**
 * Avanza un ítem un paso. No hace nada si el ítem no es de este sector, o
 * si ya está en 'listo'/'entregado' (no hay paso siguiente que este botón
 * maneje).
 */
export async function avanzarItem(
  itemId: string,
  sectorId: string,
): Promise<void> {
  if (!(await puedeOperarEnSector(sectorId))) return;

  const supabase = await crearClienteServidor();
  await supabase.rpc("cambiar_estado_item_sector", {
    p_sector_id: sectorId,
    p_avanzar: true,
    p_item_id: itemId,
  });
}

/**
 * Avanza todos los ítems de un pedido (en este sector) un paso cada uno.
 * Es un solo update adentro de la función, y un update visita cada fila
 * una vez: ningún ítem pendiente salta directo a listo de un solo toque.
 */
export async function avanzarPedido(
  pedidoId: string,
  sectorId: string,
): Promise<void> {
  if (!(await puedeOperarEnSector(sectorId))) return;

  const supabase = await crearClienteServidor();
  await supabase.rpc("cambiar_estado_item_sector", {
    p_sector_id: sectorId,
    p_avanzar: true,
    p_pedido_id: pedidoId,
  });
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
  if (!(await puedeOperarEnSector(sectorId))) return;

  const supabase = await crearClienteServidor();
  await supabase.rpc("cambiar_estado_item_sector", {
    p_sector_id: sectorId,
    p_avanzar: false,
    p_item_id: itemId,
  });
}
