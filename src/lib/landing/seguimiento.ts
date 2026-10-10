import type { EstadoItem, EstadoPedido } from "@/types/database";

/**
 * En qué anda el pedido, dicho como lo entiende el cliente. La base tiene
 * estado por pedido y por ítem (cocina y barra avanzan cada una a su
 * ritmo, ver docs/SCHEMA.md "Estados"); al cliente le importa una sola
 * cosa: ¿ya lo puedo ir a buscar?
 *
 * - `esperando`: el pedido llegó, el local todavía no lo confirmó.
 * - `preparando`: confirmado y con algo todavía sin terminar (aunque la
 *   cocina no haya empezado: para el cliente ya está "en preparación").
 * - `listo`: todos los ítems listos (o ya entregados).
 * - `entregado` / `cancelado`: terminó.
 */
export type EtapaPedido =
  | "esperando"
  | "preparando"
  | "listo"
  | "entregado"
  | "cancelado";

export function etapaDelPedido(
  estado: EstadoPedido,
  items: { estado: EstadoItem }[],
): EtapaPedido {
  switch (estado) {
    case "pendiente_confirmar":
      return "esperando";
    case "cancelado":
      return "cancelado";
    case "entregado":
      return "entregado";
    case "confirmado":
      return items.length > 0 &&
        items.every(
          (item) => item.estado === "listo" || item.estado === "entregado",
        )
        ? "listo"
        : "preparando";
  }
}

export function etapaTerminada(etapa: EtapaPedido): boolean {
  return etapa === "entregado" || etapa === "cancelado";
}
