import type { ModalidadPedido } from "@/types/database";

/**
 * Validaciones del pedido de la landing pública. Las usan el formulario
 * (para avisar antes de enviar) y la Server Action (que no confía en lo
 * que llega del navegador). La última palabra la tiene
 * `crear_pedido_landing`, que repite estos mismos límites: la función se
 * puede llamar directo con la clave anónima, que es pública.
 *
 * Mismos números que supabase/migrations/20261010005433_landing_take_away.sql:
 * si se cambia uno, cambiarlo en los dos lados.
 */
export const LIMITES_PEDIDO = {
  nombre: 80,
  direccion: 200,
  nota: 300,
  notaItem: 140,
  lineas: 50,
  cantidad: 99,
} as const;

const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && REGEX_UUID.test(valor);
}

export function esModalidad(valor: unknown): valor is ModalidadPedido {
  return valor === "retiro" || valor === "envio";
}

export function validarNombreCliente(nombre: string): string | null {
  const limpio = nombre.trim();
  if (!limpio) return "Escribí tu nombre, así el local sabe de quién es el pedido.";
  if (limpio.length > LIMITES_PEDIDO.nombre) {
    return `El nombre puede tener hasta ${LIMITES_PEDIDO.nombre} letras.`;
  }
  return null;
}

// Sin teléfono a propósito: el contacto con el cliente es el chat de
// WhatsApp que él mismo abre al confirmar (ver src/app/[slug]/landing.tsx).

export function validarModalidad(
  modalidad: ModalidadPedido | null,
): string | null {
  return modalidad ? null : "Elegí si lo pasás a buscar o te lo llevan.";
}

export function validarDireccion(
  direccion: string,
  modalidad: ModalidadPedido | null,
): string | null {
  if (modalidad !== "envio") return null;
  const limpio = direccion.trim();
  if (!limpio) return "Escribí la dirección a donde te lo llevan.";
  if (limpio.length > LIMITES_PEDIDO.direccion) {
    return `La dirección puede tener hasta ${LIMITES_PEDIDO.direccion} letras.`;
  }
  return null;
}

export function validarNotaPedido(nota: string): string | null {
  return nota.trim().length > LIMITES_PEDIDO.nota
    ? `La aclaración puede tener hasta ${LIMITES_PEDIDO.nota} letras.`
    : null;
}
