/**
 * El código corto del borrador de mesa: lo que viaja adentro del QR que el
 * cliente le muestra al mozo.
 *
 * Vive acá, y no en la landing ni en /app, porque lo necesitan los dos
 * lados: la pantalla del cliente (que lo guarda en su celular) y la del
 * mozo (que lo recibe en la URL al escanear, o tipeado a mano). Es un
 * módulo común a propósito: sin `server-only` y sin "use client".
 */

/**
 * Mismo formato que el check `borradores_pedido_codigo_formato` de la base:
 * base32 de Crockford, sin I, L, O ni U — las cuatro letras que se
 * confunden al leerlas en voz alta o al tipearlas (ver
 * supabase/migrations/). Si se cambia allá, acá también.
 */
export const REGEX_CODIGO_BORRADOR = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Cuántos caracteres tiene, para el `maxlength` del campo a mano. */
export const LARGO_CODIGO_BORRADOR = 8;

/**
 * Lo deja como lo guarda la base: mayúsculas y sin espacios alrededor —
 * el mismo `upper(btrim(...))` que hacen `leer_borrador_qr` y
 * `convertir_borrador_qr`. Hace falta porque el mozo puede llegar
 * tipeándolo (cuando la cámara no quiere leer la pantalla del cliente) y
 * el teclado del celular manda minúsculas.
 */
export function normalizarCodigoBorrador(valor: string): string {
  return valor.trim().toUpperCase();
}

export function esCodigoBorrador(valor: unknown): valor is string {
  return typeof valor === "string" && REGEX_CODIGO_BORRADOR.test(valor);
}
