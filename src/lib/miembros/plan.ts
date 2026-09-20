import type { PlanComercio, RolMiembro } from "@/types/database";

/**
 * Espejo en TypeScript de `plan_permite_rol` (supabase/migrations/): hoy el
 * único rol que un plan puede bloquear es `mozo` (necesita salón o
 * completo). Se usa al crear/editar personal y para calcular cuántos
 * usuarios ocupan el límite — tiene que coincidir exactamente con la
 * función SQL; si esa regla cambia, cambiar acá también.
 */
export function planPermiteRol(plan: PlanComercio, rol: RolMiembro): boolean {
  if (rol === "mozo") {
    return plan === "salon" || plan === "completo";
  }
  return true;
}

/**
 * Espejo de `usuarios_ocupados` (supabase/migrations/): miembros activos con
 * un rol que el plan actual permite.
 *
 * Para un solo comercio conviene llamar a esa función por RPC (fuente de
 * verdad, sin costo extra: es un comercio, una consulta). Esto es para
 * cuando ya se tiene una lista de miembros de varios comercios en memoria
 * (como /admin) y llamar a la función por cada fila sería una consulta de
 * más por comercio.
 */
export function contarUsuariosOcupados(
  miembros: { activo: boolean; rol: RolMiembro }[],
  plan: PlanComercio,
): number {
  return miembros.filter((m) => m.activo && planPermiteRol(plan, m.rol)).length;
}
