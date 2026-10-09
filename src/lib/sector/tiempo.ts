const UMBRAL_DEMORA_MINUTOS = 15;

/**
 * true si el pedido entró hace más de `UMBRAL_DEMORA_MINUTOS` — la
 * pantalla de sector lo usa para resaltar visualmente las tarjetas
 * demoradas, no solo cambiar el texto.
 */
export function estaDemorado(creadoEn: string): boolean {
  const minutos = (Date.now() - new Date(creadoEn).getTime()) / 60000;
  return minutos >= UMBRAL_DEMORA_MINUTOS;
}
