import type { PlanComercio } from "@/types/database";

/**
 * Validaciones compartidas por el ABM de mesas (/app/mesas). Se usan
 * siempre del lado del servidor (adentro de las Server Actions): los
 * `required`/`min` del `<form>` son solo para feedback inmediato.
 */

// Tope defensivo para el alta en lote: ningún local carga tantas mesas de
// una, y evita un fat-finger tipo "de la 1 a la 99999" (99998 inserts más
// el chequeo de duplicados en memoria contra ese volumen).
export const LIMITE_LOTE_MESAS = 200;

export function validarNombreMesa(nombre: string): string | null {
  return nombre.trim().length > 0 ? null : "El nombre es obligatorio.";
}

export function validarPrefijoLote(prefijo: string): string | null {
  return prefijo.trim().length > 0 ? null : "El prefijo es obligatorio.";
}

export function validarDesdeLote(desdeTexto: string): string | null {
  const desde = Number(desdeTexto);
  if (!Number.isInteger(desde) || desde < 1) {
    return "Tiene que ser un número entero mayor o igual a 1.";
  }
  return null;
}

export function validarHastaLote(
  desdeTexto: string,
  hastaTexto: string,
): string | null {
  const desde = Number(desdeTexto);
  const hasta = Number(hastaTexto);
  if (!Number.isInteger(hasta) || hasta < desde) {
    return "Tiene que ser un número entero mayor o igual al inicial.";
  }
  if (hasta - desde + 1 > LIMITE_LOTE_MESAS) {
    return `No se pueden crear más de ${LIMITE_LOTE_MESAS} mesas de una vez.`;
  }
  return null;
}

/**
 * Mesas (como el resto de "salón") solo existe en los planes que lo
 * incluyen — ver docs/SCHEMA.md, "Planes". A diferencia del rol `mozo`
 * (bloqueado en la base por `plan_permite_rol`, evaluado dentro de
 * `tiene_rol`), esto no lo aplica RLS: la policy `mesas_duenio` no mira el
 * plan, así que un dueño técnicamente podría escribir en `mesas` aunque su
 * comercio sea `take_away`. El bloqueo es enteramente de la aplicación —
 * por eso se valida acá y en cada Server Action, no solo en la página.
 */
export function planPermiteSalon(plan: PlanComercio): boolean {
  return plan === "salon" || plan === "completo";
}
