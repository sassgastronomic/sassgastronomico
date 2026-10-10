import { headers } from "next/headers";

/**
 * El link de seguimiento de un pedido: lo que se le muestra al cliente al
 * confirmar, va en su mensaje de WhatsApp y el mostrador puede reenviar.
 */
export function linkSeguimiento(
  origen: string,
  slug: string,
  codigo: string,
): string {
  return `${origen}/${slug}/pedido/${codigo}`;
}

// Direcciones de desarrollo (la compu o la red local): ahí no hay https.
const REGEX_HOST_LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * "https://dominio" con el que entró quien hizo el request, para armar
 * links absolutos del lado del servidor (Server Components y Server
 * Actions). En producción es el dominio real; en desarrollo, la dirección
 * con la que se abrió la app (para probar desde el celular, la IP de la
 * red, no `localhost`).
 *
 * Detrás de un proxy (Vercel) el host y el protocolo originales llegan en
 * `x-forwarded-*`. Que alguien los falsee llamando a la acción a mano solo
 * le cambia el link de su propio mensaje.
 */
export async function origenDelRequest(): Promise<string> {
  const encabezados = await headers();
  const host = (
    encabezados.get("x-forwarded-host") ??
    encabezados.get("host") ??
    "localhost:3000"
  )
    .split(",")[0]
    .trim();
  const protocolo =
    encabezados.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (REGEX_HOST_LOCAL.test(host) ? "http" : "https");
  return `${protocolo}://${host}`;
}
