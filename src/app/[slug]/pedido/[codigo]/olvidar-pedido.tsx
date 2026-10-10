"use client";

import { useEffect } from "react";

import { olvidarPedido } from "../../almacen-local";

/**
 * Saca el pedido de lo guardado en el celular, sin mostrar nada. La pone
 * la pantalla de seguimiento cuando el pedido ya está cerrado (entregado o
 * cancelado) o el link ya no existe: el cliente ya lo vio, así que al
 * volver a la carta el aviso "Tu pedido #N" ya no está. No consulta nada:
 * es solo el celular.
 */
export function OlvidarPedidoGuardado({
  slug,
  codigo,
}: {
  slug: string;
  codigo: string;
}) {
  useEffect(() => {
    olvidarPedido(slug, codigo);
  }, [slug, codigo]);

  return null;
}
