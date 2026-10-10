"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ItemPedidoMozo } from "@/types/database";

/**
 * Dueño o mozo, con plan que incluya salón — mismo criterio que la
 * página. Devuelve el comercio y la cuenta abierta de la mesa, o null si
 * algo no cierra (sin permiso, mesa ajena o sin cuenta abierta).
 */
async function cuentaAbiertaDeMesa(
  mesaId: string,
): Promise<{ comercioId: string; cuentaId: string } | null> {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") return null;
  if (contexto.rol !== "duenio" && contexto.rol !== "mozo") return null;
  if (!planPermiteSalon(contexto.comercio.plan)) return null;

  const supabase = await crearClienteServidor();
  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("id")
    .eq("mesa_id", mesaId)
    .eq("comercio_id", contexto.comercio.id)
    .eq("estado", "abierta")
    .maybeSingle();

  if (!cuenta) return null;
  return { comercioId: contexto.comercio.id, cuentaId: cuenta.id };
}

/**
 * Ids de los ítems listos de esta cuenta (de pedidos confirmados). Si se
 * pasa `itemId`, solo ese — y solo si de verdad es de esta mesa y está
 * listo: no se confía en el id que llega del formulario.
 */
async function itemsListosDeCuenta(
  comercioId: string,
  cuentaId: string,
  itemId?: string,
): Promise<string[]> {
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("pedido_items")
    .select("id, pedidos!inner(cuenta_id, estado)")
    .eq("comercio_id", comercioId)
    .eq("estado", "listo")
    .eq("pedidos.cuenta_id", cuentaId)
    .eq("pedidos.estado", "confirmado");
  if (itemId) consulta = consulta.eq("id", itemId);

  const { data } = await consulta;
  return (data ?? []).map((item) => item.id);
}

/**
 * Marca como entregados los ítems indicados. El `.eq("estado", "listo")`
 * del update evita pisar un ítem que cambió entre la consulta y la
 * escritura (por ejemplo, cocina lo volvió a "en preparación").
 *
 * El pedido pasa a `entregado` solo cuando todos sus ítems lo están: eso
 * lo hace el trigger `item_entregado` (cerrar_pedido_si_completo) en la
 * base, no esta acción.
 */
async function entregar(
  mesaId: string,
  comercioId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const supabase = await crearClienteServidor();
  await supabase
    .from("pedido_items")
    .update({ estado: "entregado", entregado_en: new Date().toISOString() })
    .eq("comercio_id", comercioId)
    .eq("estado", "listo")
    .in("id", ids);

  revalidatePath(`/app/salon/${mesaId}`);
  revalidatePath("/app/salon");
}

/**
 * Marca un ítem listo como entregado. Para un `<form action={...bind(null,
 * mesaId, itemId)}>`: ante un caso inválido (sin permiso, ítem ajeno o que
 * ya no está listo) no hace nada — no hay estado de error que mostrar.
 */
export async function marcarEntregado(
  mesaId: string,
  itemId: string,
  _formData: FormData,
): Promise<void> {
  void _formData;
  const cuenta = await cuentaAbiertaDeMesa(mesaId);
  if (!cuenta) return;

  const ids = await itemsListosDeCuenta(cuenta.comercioId, cuenta.cuentaId, itemId);
  await entregar(mesaId, cuenta.comercioId, ids);
}

export type PendientesPorEstado = {
  pendiente: number;
  en_preparacion: number;
  listo: number;
};

// Si cierra, no devuelve nada: redirige a /app/salon.
export type ResultadoCerrarCuenta =
  | { tipo: "pendientes"; pendientes: PendientesPorEstado }
  | { tipo: "error"; error: string };

/**
 * Cierra la cuenta de la mesa. Se llama directo desde la hoja de cierre
 * (./cerrar-cuenta.tsx), no desde un <form>, porque tiene que devolver
 * qué falta entregar si no se puede cerrar.
 *
 * El chequeo de "no queda nada sin entregar" y el cierre los hace
 * `cerrar_cuenta` en la base, con la cuenta bloqueada: lo que muestra la
 * pantalla puede estar desactualizado, esto no.
 *
 * Al cerrar redirige acá mismo en vez de usar revalidatePath: rearmar la
 * página de la mesa ya cerrada la mandaría a /app/salon con el aviso
 * "puede que la hayan cerrado", pensado para cuando la cierra otro.
 */
export async function cerrarCuenta(
  mesaId: string,
): Promise<ResultadoCerrarCuenta> {
  const cuenta = await cuentaAbiertaDeMesa(mesaId);
  if (!cuenta) {
    return {
      tipo: "error",
      error: "Esa mesa ya no tiene una cuenta abierta.",
    };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("cerrar_cuenta", {
    p_cuenta_id: cuenta.cuentaId,
  });

  if (error || !data) {
    return {
      tipo: "error",
      error: error?.message ?? "No se pudo cerrar la mesa. Probá de nuevo.",
    };
  }

  if (!data.ok) {
    return {
      tipo: "pendientes",
      pendientes: {
        pendiente: data.pendiente,
        en_preparacion: data.en_preparacion,
        listo: data.listo,
      },
    };
  }

  // `replace`: que el botón "atrás" no vuelva a la mesa ya cerrada.
  redirect("/app/salon", RedirectType.replace);
}

/** Marca como entregado todo lo que está listo en la mesa, de una. */
export async function marcarTodoEntregado(
  mesaId: string,
  _formData: FormData,
): Promise<void> {
  void _formData;
  const cuenta = await cuentaAbiertaDeMesa(mesaId);
  if (!cuenta) return;

  const ids = await itemsListosDeCuenta(cuenta.comercioId, cuenta.cuentaId);
  await entregar(mesaId, cuenta.comercioId, ids);
}

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
