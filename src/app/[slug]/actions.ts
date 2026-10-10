"use server";

import { validarSlug } from "@/lib/comercios/validacion";
import {
  LIMITES_PEDIDO,
  esModalidad,
  esUuid,
  validarDireccion,
  validarModalidad,
  validarNombreCliente,
  validarNotaPedido,
} from "@/lib/landing/validacion";
import { linkSeguimiento, origenDelRequest } from "@/lib/landing/link";
import { mensajeNuevoPedido } from "@/lib/landing/whatsapp";
import { crearClientePublico } from "@/lib/supabase/publico";
import type { ItemPedidoLanding } from "@/types/database";

export type CampoPedido = "nombre" | "modalidad" | "direccion" | "nota";

export type ResultadoEnvioPedido =
  | {
      ok: true;
      numero: number;
      codigo: string;
      // El link de seguimiento, absoluto, para mostrárselo al cliente.
      link: string;
      // El texto para WhatsApp, armado acá con lo que guardó la base (y el
      // link adentro).
      mensaje: string;
    }
  | {
      ok: false;
      error: string;
      campo?: CampoPedido;
      // Productos del pedido que ya no se pueden pedir (sin stock o fuera
      // de la carta): la pantalla los marca en rojo, sin recargar.
      noDisponibles?: string[];
      // El local dejó de tomar pedidos (suspendido, sin take away, sin
      // WhatsApp): hay que volver a pedir la página, que muestra el aviso.
      recargarPagina?: boolean;
    };

const ERROR_GENERICO =
  "No pudimos enviar tu pedido. Revisá tu conexión y probá de nuevo.";
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

// Cuáles de los productos pedidos ya no se pueden pedir, según la carta de
// este momento (misma fuente que la pantalla: carta_publica). La función
// que crea el pedido corta en el primero que falla; así el cliente ve
// todos los que tiene que sacar, no de a uno por intento.
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
      items
        .map((item) => item.producto_id)
        .filter((id) => !disponibles.has(id)),
    ),
  ];
}

/**
 * Manda un pedido de la landing pública.
 *
 * Es un endpoint público y anónimo: cualquiera le puede pegar directo, sin
 * pasar por la pantalla, así que los parámetros son `unknown` a propósito
 * y se revisa todo acá. Igual, quien manda es `crear_pedido_landing`:
 * repite estas validaciones, toma los precios de la base (nunca de lo que
 * manda el navegador) y crea el pedido en `pendiente_confirmar`. Se la
 * llama con el cliente público (siempre como `anon`), igual que la carta.
 *
 * No pide teléfono: el contacto es el chat de WhatsApp que el cliente
 * abre al confirmar, con el mensaje que devuelve esta acción. Devuelve
 * también el link de seguimiento, que la pantalla le muestra al cliente.
 */
export async function enviarPedido(
  slug: unknown,
  envio: unknown,
): Promise<ResultadoEnvioPedido> {
  if (
    typeof slug !== "string" ||
    validarSlug(slug) !== null ||
    !esObjeto(envio)
  ) {
    return { ok: false, error: ERROR_CARRITO };
  }

  const nombre = texto(envio.nombre).trim();
  const modalidad = esModalidad(envio.modalidad) ? envio.modalidad : null;
  const direccion = texto(envio.direccion).trim();
  const nota = texto(envio.nota).trim();

  const errores: [CampoPedido, string | null][] = [
    ["nombre", validarNombreCliente(nombre)],
    ["modalidad", validarModalidad(modalidad)],
    ["direccion", validarDireccion(direccion, modalidad)],
    ["nota", validarNotaPedido(nota)],
  ];
  for (const [campo, error] of errores) {
    if (error) return { ok: false, error, campo };
  }
  // Para TypeScript: si llegó acá, validarModalidad ya lo garantizó.
  if (!modalidad) return { ok: false, error: ERROR_CARRITO };

  const items = interpretarItems(envio.items);
  if (!items) return { ok: false, error: ERROR_CARRITO };

  const supabase = crearClientePublico();
  const { data, error } = await supabase.rpc("crear_pedido_landing", {
    p_slug: slug,
    p_cliente_nombre: nombre,
    p_cliente_telefono: null,
    p_modalidad: modalidad,
    p_direccion: modalidad === "envio" ? direccion : null,
    p_nota: nota || null,
    p_items: items,
  });

  if (error || !data) {
    // P0001 = `raise exception` de la función: mensajes escritos para el
    // cliente ("Ya no está disponible: …"). Cualquier otro código es un
    // error técnico y no se muestra tal cual.
    if (error?.code === "P0001") {
      if (error.message.startsWith("Ya no está disponible")) {
        return {
          ok: false,
          error: `${error.message}. Sacalo de tu pedido para poder enviarlo.`,
          noDisponibles: await productosNoDisponibles(slug, items),
        };
      }
      if (error.message.startsWith("Este local no está tomando pedidos")) {
        return { ok: false, error: error.message, recargarPagina: true };
      }
      return { ok: false, error: error.message };
    }
    console.error("[landing] crear_pedido_landing:", error);
    return { ok: false, error: ERROR_GENERICO };
  }

  // El pedido ya está creado y su código ya existe (lo genera el mismo
  // insert): recién ahora se arma el link y el mensaje. Si por algo no
  // llegara, no se manda un mensaje con el link vacío.
  if (!data.codigo_seguimiento) {
    console.error("[landing] crear_pedido_landing no devolvió el código");
    return { ok: false, error: ERROR_GENERICO };
  }
  const link = linkSeguimiento(
    await origenDelRequest(),
    slug,
    data.codigo_seguimiento,
  );

  return {
    ok: true,
    numero: data.numero,
    codigo: data.codigo_seguimiento,
    link,
    mensaje: mensajeNuevoPedido({
      numero: data.numero,
      cliente_nombre: nombre,
      modalidad,
      direccion: modalidad === "envio" ? direccion : null,
      nota: nota || null,
      items: data.items,
      link,
    }),
  };
}
