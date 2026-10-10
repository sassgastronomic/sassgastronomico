import type {
  ItemPedidoGuardado,
  ModalidadPedido,
  SeguimientoPedidoResultado,
} from "@/types/database";

import { formatearPrecio, subtotalLinea, totalDelPedido } from "./precios";

/**
 * Link que abre WhatsApp con el mensaje ya escrito: el cliente solo tiene
 * que apretar enviar. `numero` va como lo guarda `comercios.whatsapp`
 * (solo dígitos, con código de país), que es lo que pide wa.me.
 */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export type PedidoParaMensaje = {
  numero: number;
  cliente_nombre: string;
  modalidad: ModalidadPedido;
  direccion: string | null;
  nota: string | null;
  items: ItemPedidoGuardado[];
  // El link de seguimiento: el pedido ya está creado (y el código ya
  // existe) cuando se arma este mensaje — ver src/app/[slug]/actions.ts.
  link: string;
};

/**
 * El mensaje con el que el cliente le manda su pedido al local. Es, además,
 * el contacto: la landing no pide teléfono, el local le contesta por este
 * mismo chat.
 *
 * - Arranca con el número de pedido en negrita (los asteriscos son negrita
 *   en WhatsApp), para que el mostrador lo cruce con su pantalla de un
 *   vistazo.
 * - Ítems, precios y total salen de lo que quedó guardado en la base, no
 *   del carrito: son los mismos que ve el local en el sistema.
 * - Termina con el link de seguimiento: queda guardado en el chat del
 *   propio cliente (si lo pierde, lo encuentra ahí) y el local también lo
 *   tiene.
 */
export function mensajeNuevoPedido(pedido: PedidoParaMensaje): string {
  const lineas = pedido.items.flatMap((item) => {
    const subtotal = subtotalLinea(
      item.precio_unitario,
      item.adicionales.map((adicional) => adicional.precio_extra),
      item.cantidad,
    );
    const nombre = item.categoria_nombre
      ? `${item.nombre} (${item.categoria_nombre})`
      : item.nombre;
    return [
      `• ${item.cantidad} × ${nombre}: ${formatearPrecio(subtotal)}`,
      ...(item.adicionales.length > 0
        ? [`   Con: ${item.adicionales.map((a) => a.nombre).join(", ")}`]
        : []),
      ...(item.nota ? [`   Nota: ${item.nota}`] : []),
    ];
  });

  const entrega =
    pedido.modalidad === "envio"
      ? `Envío a: ${pedido.direccion ?? ""}. El costo del envío lo arreglamos aparte.`
      : "Lo paso a buscar por el local.";

  return [
    `*PEDIDO #${pedido.numero}*`,
    `¡Hola! Soy ${pedido.cliente_nombre} y te hago este pedido por la web:`,
    "",
    ...lineas,
    "",
    `*Total: ${formatearPrecio(totalDelPedido(pedido.items))}*`,
    entrega,
    ...(pedido.nota ? [`Aclaración: ${pedido.nota}`] : []),
    "",
    `Sigo el pedido acá: ${pedido.link}`,
  ].join("\n");
}

// Lo que copia el mostrador para reenviarle el link al cliente por el
// chat (si lo perdió, o lo pide). Sirve en cualquier momento del pedido.
export function mensajeLinkSeguimiento(pedido: {
  numero: number;
  cliente_nombre: string;
  link: string;
}): string {
  return [
    `¡Hola, ${pedido.cliente_nombre}! Este es el link para seguir tu pedido *#${pedido.numero}*:`,
    pedido.link,
  ].join("\n");
}

// Para escribirle al local desde el seguimiento (o cuando no hay a mano
// el mensaje completo del pedido): corto, con el número para ubicarlo.
export function mensajeConsultaPedido(
  pedido: Pick<SeguimientoPedidoResultado, "numero"> & {
    cliente_nombre?: string;
  },
): string {
  return pedido.cliente_nombre
    ? `¡Hola! Te escribo por mi pedido #${pedido.numero}, a nombre de ${pedido.cliente_nombre}.`
    : `¡Hola! Te escribo por mi pedido #${pedido.numero}.`;
}
