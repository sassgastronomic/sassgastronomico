/**
 * Fechas y horas en la zona horaria del comercio.
 *
 * `Intl.DateTimeFormat` sin `timeZone` usa la del servidor, no la del local:
 * en desarrollo es la de tu máquina (UTC-3) y en Vercel es UTC, así que las
 * mismas 19:40 saldrían 22:40 en producción. Cada comercio tiene su
 * `zona_horaria` (ver docs/SCHEMA.md) y es la única que vale — tampoco la
 * del navegador de quien mira, que puede estar de viaje.
 *
 * Todo lo que se muestre con hora o fecha del día pasa por acá. Lo que no
 * necesita zona y no hay que tocar:
 *
 * - Los "hace X min" (src/lib/salon/tiempo.ts, src/lib/sector/tiempo.ts):
 *   son restas de epoch, no dependen de ninguna zona.
 * - La hora de apertura de caja: la arma la base con
 *   `to_char(... at time zone zona_horaria)`.
 * - La jornada (`formatearJornada` en src/lib/caja/caja.ts): es una fecha
 *   sin hora, y por eso se formatea en UTC a propósito.
 */

// Armar un Intl.DateTimeFormat no es gratis y en una lista (el panel de
// admin) haría uno por fila: se guarda uno por zona y listo.
const formateadores = new Map<string, Intl.DateTimeFormat>();

function obtenerFormateador(
  clave: string,
  armar: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  const guardado = formateadores.get(clave);
  if (guardado) return guardado;
  const nuevo = armar();
  formateadores.set(clave, nuevo);
  return nuevo;
}

// En 24 horas y no "07:40 p. m.", que es lo que da es-AR por defecto: es
// el formato de acá y ocupa menos lugar en las filas apretadas del
// celular. `hour12: false` en es-AR da "00:15" a la medianoche (no
// "24:15"), que es lo que importa en un local abierto de noche. La hora de
// apertura de caja, que la arma la base, ya usa `to_char(..., 'HH24:MI')`.
/** La hora del local: "19:40". */
export function formatearHora(instante: string, zonaHoraria: string): string {
  return obtenerFormateador(`hora:${zonaHoraria}`, () =>
    new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: zonaHoraria,
    }),
  ).format(new Date(instante));
}

/** El día del local: "21/11/2026". */
export function formatearFecha(instante: string, zonaHoraria: string): string {
  return obtenerFormateador(`fecha:${zonaHoraria}`, () =>
    new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: zonaHoraria,
    }),
  ).format(new Date(instante));
}
