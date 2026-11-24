"use server";

import { revalidatePath } from "next/cache";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type ResultadoQrMesa =
  | { ok: true; activo: boolean }
  | { ok: false; error: string };

/**
 * Prende o apaga el pedido por QR de mesa del comercio.
 *
 * Lo hace `cambiar_qr_mesa` en la base, que valida `tiene_rol(duenio)` y el
 * plan adentro y toca una sola columna. `comercios` no tiene policy de
 * UPDATE para el dueño a propósito: una policy habilita la fila entera, así
 * que le dejaría cambiarse el plan, el estado y el límite de usuarios con
 * una llamada directa a la API (ver supabase/migrations/ y docs/SCHEMA.md).
 *
 * Acá se hace solo el primer filtro barato (sesión, rol, plan) para dar un
 * error claro sin gastar una llamada a la base.
 */
export async function cambiarQrMesa(activo: boolean): Promise<ResultadoQrMesa> {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    return { ok: false, error: "Tu sesión ya no es válida. Volvé a entrar." };
  }
  if (contexto.rol !== "duenio") {
    return { ok: false, error: "Solo el dueño puede cambiar esto." };
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    return { ok: false, error: "Tu plan no incluye salón." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_qr_mesa", {
    p_comercio_id: contexto.comercio.id,
    p_activo: activo,
  });

  if (error) {
    return {
      ok: false,
      // P0001 = `raise exception` de la función: su texto está escrito para
      // mostrarse ("No autorizado", "Tu plan no incluye salón").
      error:
        error.code === "P0001"
          ? error.message
          : "No se pudo guardar el cambio. Probá de nuevo.",
    };
  }

  revalidatePath("/app/mesas");
  return { ok: true, activo };
}
