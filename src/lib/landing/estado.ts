/**
 * El estado del local que la landing abierta consulta cada tanto, para
 * mantenerse al día sin que el cliente recargue: si está tomando pedidos
 * (caja abierta) y qué productos están sin stock. Acá está el contrato
 * entre las dos puntas: la URL, la forma de la respuesta y cuánto la
 * guarda el CDN.
 *
 * - Servidor: src/app/api/landing/[slug]/estado/route.ts.
 * - Cliente: src/app/[slug]/vigilar-estado-local.tsx.
 *
 * Por qué así y no Realtime: el cliente es anónimo, y cada pantalla con
 * Realtime es una conexión de las contadas del plan (ver docs/SCHEMA.md,
 * "Realtime"). Una respuesta chica y cacheada en el CDN cuesta casi nada:
 * miren cuantos miren, la base recibe a lo sumo una consulta por local cada
 * SEGUNDOS_EN_CDN.
 */

// Cuánto guarda el CDN (Vercel) la respuesta. También es lo más atrasada
// que puede llegar: por eso la respuesta dice cuándo se leyó (`leidoEn`), y
// la landing descarta la que sea más vieja que su propia carta.
export const SEGUNDOS_EN_CDN = 30;

export type EstadoLocal = {
  tomandoPedidos: boolean;
  // Ids de los productos sin stock.
  sinStock: string[];
  // Cuándo se leyó de la base (milisegundos, reloj del servidor).
  leidoEn: number;
};

export function urlEstadoLocal(slug: string): string {
  return `/api/landing/${encodeURIComponent(slug)}/estado`;
}

// Lo que llegó por la red, sin confiar en que tenga la forma esperada.
export function leerEstadoLocal(cuerpo: unknown): EstadoLocal | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const tomandoPedidos: unknown = Reflect.get(cuerpo, "tomandoPedidos");
  const sinStock: unknown = Reflect.get(cuerpo, "sinStock");
  const leidoEn: unknown = Reflect.get(cuerpo, "leidoEn");
  if (
    typeof tomandoPedidos !== "boolean" ||
    !Array.isArray(sinStock) ||
    !sinStock.every((id): id is string => typeof id === "string") ||
    typeof leidoEn !== "number"
  ) {
    return null;
  }
  return { tomandoPedidos, sinStock, leidoEn };
}
