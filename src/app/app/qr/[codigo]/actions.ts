"use server";

import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import {
  esCodigoBorrador,
  normalizarCodigoBorrador,
} from "@/lib/qr-mesa/codigo";
import { crearClienteServidor } from "@/lib/supabase/server";

// Si carga, no devuelve nada: redirige al detalle de la mesa, donde el
// mozo ya ve la ronda adentro.
export type ResultadoCargarBorrador = { ok: false; error: string };

/**
 * Carga en una mesa el pedido que el cliente armó con el QR.
 *
 * Toda la validación que importa vive en `convertir_borrador_qr` (ver
 * supabase/migrations/), en una sola transacción: rol, borrador vigente y
 * sin usar, comercio activo con plan de salón, mesa de este comercio y
 * activa, apertura de la cuenta si la mesa estaba libre, y la
 * revalidación de disponibilidad producto por producto. Acá se hace solo
 * el primer filtro barato (sesión, rol, plan, formato del código) para dar
 * un error claro sin gastar una llamada a la base.
 *
 * Es importante que esa revalidación esté del otro lado y no acá: entre
 * que la pantalla se dibujó y el mozo toca el botón pueden pasar minutos.
 * Si algo se acabó en el medio, la transacción se cae entera — la cuenta
 * recién abierta incluida — y no queda nada a medias.
 */
export async function cargarBorradorEnMesa(
  codigo: string,
  mesaId: string,
): Promise<ResultadoCargarBorrador> {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    return { ok: false, error: "Tu sesión ya no es válida. Volvé a entrar." };
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mozo") {
    return { ok: false, error: "No tenés permiso para cargar pedidos." };
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    return { ok: false, error: "Este comercio no tiene salón habilitado." };
  }

  const normalizado = normalizarCodigoBorrador(codigo);
  if (!esCodigoBorrador(normalizado)) {
    return { ok: false, error: "Ese código no tiene el formato correcto." };
  }
  if (!mesaId) {
    return { ok: false, error: "Elegí en qué mesa va el pedido." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("convertir_borrador_qr", {
    p_codigo: normalizado,
    p_mesa_id: mesaId,
  });

  if (error || !data) {
    return {
      ok: false,
      // P0001 = `raise exception` de la función: esos textos están escritos
      // para mostrarse tal cual ("Ese código ya venció: pedile al cliente
      // que lo arme de nuevo", "Ya no está disponible: Muzzarella").
      error:
        error?.code === "P0001"
          ? error.message
          : "No se pudo cargar el pedido. Probá de nuevo.",
    };
  }

  // Sin `revalidatePath`: esta ruta depende de la sesión (cookies), así que
  // Next.js nunca la sirve del Full Route Cache, y el redirect ya trae el
  // destino recién renderizado.
  //
  // `push` y no `replace` a propósito: si el mozo toca "atrás" vuelve a
  // esta pantalla, que ahora le dice "ya lo cargaste, es la ronda #N" —
  // justo lo que necesita saber si dudó de si el toque entró.
  redirect(`/app/salon/${mesaId}`);
}
