"use server";

import { validarSlug } from "@/lib/comercios/validacion";
import { linkEscaneoMozo, origenDelRequest } from "@/lib/landing/link";
import { LIMITES_PEDIDO, esUuid } from "@/lib/landing/validacion";
import { crearClientePublico } from "@/lib/supabase/publico";
import type { ItemPedidoLanding } from "@/types/database";

export type ResultadoBorradorQr =
  | {
      ok: true;
      // El código corto que el cliente le muestra al mozo, por si no puede
      // escanear el QR y lo tiene que tipear.
      codigo: string;
      // El link que va adentro del QR (absoluto: lo escanea otro celular).
      link: string;
      // Hasta cuándo vale, en milisegundos.
      venceEn: number;
    }
  | {
      ok: false;
      error: string;
      // Productos que ya no se pueden pedir (sin stock o fuera de la
      // carta): la pantalla los marca en rojo, sin recargar.
      noDisponibles?: string[];
      // El local dejó de tomar pedidos desde la mesa (apagó el
      // interruptor, cerró la caja, bajó de plan): hay que volver a pedir
      // la página, que muestra el aviso que corresponda.
      recargarPagina?: boolean;
    };

const ERROR_GENERICO =
  "No pudimos armar tu código. Revisá tu conexión y probá de nuevo.";
const ERROR_CARRITO =
  "Hay un problema con tu pedido. Recargá la página y probá de nuevo.";

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function interpretarItems(valor: unknown): ItemPedidoLanding[] | null {
  if (!Array.isArray(valor)) return null;
  const crudos: unknown[] = valor;
  if (crudos.length === 0 || crudos.length > LIMITES_PEDIDO.lineas) return null;

  const items: ItemPedidoLanding[] = [];
  for (const crudo of crudos) {
    if (!esObjeto(crudo) || !esUuid(crudo.productoId)) return null;
    const cantidad = crudo.cantidad;
    if (
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > LIMITES_PEDIDO.cantidad
    ) {
      return null;
    }
    const nota = texto(crudo.nota).trim();
    if (nota.length > LIMITES_PEDIDO.notaItem) return null;
    const adicionales: unknown = crudo.adicionales;
    if (!Array.isArray(adicionales)) return null;
    const idsAdicionales: unknown[] = adicionales;
    if (!idsAdicionales.every(esUuid)) return null;

    items.push({
      producto_id: crudo.productoId,
      cantidad,
      nota,
      adicionales: [...new Set(idsAdicionales.filter(esUuid))],
    });
  }
  return items;
}

/**
 * Cuáles de los productos pedidos ya no se pueden pedir, según la carta de
 * este momento (misma fuente que la pantalla: carta_publica). La función
 * de la base corta en el primero que falla; así el cliente ve todos los
 * que tiene que sacar, no de a uno por intento.
 */
async function productosNoDisponibles(
  slug: string,
  items: ItemPedidoLanding[],
): Promise<string[]> {
  const { data } = await crearClientePublico().rpc("carta_publica", {
    p_slug: slug,
  });
  const disponibles = new Set(
    (data?.categorias ?? [])
      .flatMap((categoria) => categoria.productos)
      .filter((producto) => !producto.sin_stock)
      .map((producto) => producto.id),
  );
  return [
    ...new Set(
      items.map((item) => item.producto_id).filter((id) => !disponibles.has(id)),
    ),
  ];
}

/**
 * Arma el borrador del pedido que el cliente está haciendo desde la mesa y
 * devuelve el código que va en su QR.
 *
 * **No crea ningún pedido.** El borrador no vale nada hasta que un mozo lo
 * escanea: no lleva número, no toca la caja y vence solo a los 30 minutos
 * (ver docs/SCHEMA.md, "Pedido desde la mesa con QR").
 *
 * Es un endpoint público y anónimo: cualquiera le puede pegar directo, sin
 * pasar por la pantalla, así que los parámetros son `unknown` a propósito y
 * se revisa todo acá. Igual, quien manda es `crear_borrador_qr`: repite
 * estas validaciones, exige el interruptor prendido, el plan con salón y la
 * caja abierta, y guarda solo ids (los precios se resuelven recién cuando
 * el mozo escanea). Se la llama con el cliente público (siempre como
 * `anon`), igual que la carta.
 */
export async function crearBorradorMesa(
  slug: unknown,
  items: unknown,
): Promise<ResultadoBorradorQr> {
  if (typeof slug !== "string" || validarSlug(slug) !== null) {
    return { ok: false, error: ERROR_CARRITO };
  }

  const itemsValidados = interpretarItems(items);
  if (!itemsValidados) return { ok: false, error: ERROR_CARRITO };

  const supabase = crearClientePublico();
  const { data, error } = await supabase.rpc("crear_borrador_qr", {
    p_slug: slug,
    p_items: itemsValidados,
  });

  if (error || !data) {
    // P0001 = `raise exception` de la función: mensajes escritos para el
    // cliente. Cualquier otro código es un error técnico y no se muestra
    // tal cual.
    if (error?.code === "P0001") {
      if (error.message.startsWith("Ya no está disponible")) {
        return {
          ok: false,
          error: `${error.message}. Sacalo de tu pedido para poder seguir.`,
          noDisponibles: await productosNoDisponibles(slug, itemsValidados),
        };
      }
      // "Este local no está tomando pedidos desde la mesa" (interruptor,
      // plan o comercio) y "El local no está tomando pedidos en este
      // momento" (caja cerrada): las dos las resuelve la página.
      if (error.message.includes("no está tomando pedidos")) {
        return { ok: false, error: error.message, recargarPagina: true };
      }
      return { ok: false, error: error.message };
    }
    console.error("[qr mesa] crear_borrador_qr:", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  const venceEn = Date.parse(data.vence_en);
  if (!data.codigo || !Number.isFinite(venceEn)) {
    console.error("[qr mesa] crear_borrador_qr devolvió algo inesperado");
    return { ok: false, error: ERROR_GENERICO };
  }

  return {
    ok: true,
    codigo: data.codigo,
    link: linkEscaneoMozo(await origenDelRequest(), data.codigo),
    venceEn,
  };
}
