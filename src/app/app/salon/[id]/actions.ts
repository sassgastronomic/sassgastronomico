"use server";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ItemPedidoMozo } from "@/types/database";

export type ItemCarritoEnvio = {
  productoId: string;
  cantidad: number;
  nota: string;
  adicionales: string[];
};

export type ResultadoConfirmarPedido =
  | { ok: true; numero: number }
  | { ok: false; error: string };

/**
 * Confirma una ronda de pedido sobre la cuenta abierta de una mesa.
 * Se llama directo desde el carrito (./carga-pedido.tsx) como función
 * async común, no desde un <form>: el carrito ya vive como estado de
 * React en el cliente, no gana nada volviendo a armarlo como FormData con
 * inputs ocultos.
 *
 * No hay `revalidatePath` acá: esta ruta depende de la sesión (cookies) en
 * cada request, así que Next.js nunca la sirve desde el Full Route Cache
 * — alcanza con que el cliente pida `router.refresh()` después de un
 * resultado exitoso para traer la ronda nueva.
 *
 * Toda la validación real (rol, cuenta abierta, disponibilidad de cada
 * producto) vive en `crear_pedido_mozo` (ver supabase/migrations/), en una
 * sola transacción — acá solo se hace el primer filtro barato (sesión,
 * rol, plan) antes de gastar una llamada a la base.
 */
export async function confirmarPedido(
  cuentaId: string,
  items: ItemCarritoEnvio[],
): Promise<ResultadoConfirmarPedido> {
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

  if (items.length === 0) {
    return { ok: false, error: "El pedido está vacío." };
  }

  const itemsParaFuncion: ItemPedidoMozo[] = items.map((item) => ({
    producto_id: item.productoId,
    cantidad: item.cantidad,
    nota: item.nota,
    adicionales: item.adicionales,
  }));

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_pedido_mozo", {
    p_cuenta_id: cuentaId,
    p_items: itemsParaFuncion,
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo cargar el pedido. Probá de nuevo.",
    };
  }

  return { ok: true, numero: data.numero };
}
