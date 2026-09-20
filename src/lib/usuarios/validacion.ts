/**
 * Validaciones compartidas por "crear usuario" y "editar usuario" del
 * personal de un comercio (/app/usuarios). Se usan siempre del lado del
 * servidor (adentro de las Server Actions): los `required`/`pattern` del
 * `<form>` son solo para feedback inmediato, no reemplazan esto.
 */

// Mismo patrón que el check de `perfiles.usuario` en supabase/schema.sql:
// tiene que coincidir exactamente, es la fuente de verdad real.
const REGEX_USUARIO = /^[a-z0-9._]{3,30}$/;

// El dueño no se crea ni se reasigna desde /app/usuarios (ver
// docs/SCHEMA.md, "Roles"): solo existe el que creó el panel de admin. Esta
// lista es la única fuente de roles asignables acá — ni el <select> del
// form ni ningún otro lado ofrecen 'duenio'.
const ROLES_ASIGNABLES = ["mostrador", "mozo", "sector"] as const;
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

export function esRolAsignable(valor: string): valor is RolAsignable {
  return (ROLES_ASIGNABLES as readonly string[]).includes(valor);
}

export function validarNombreUsuario(nombre: string): string | null {
  return nombre.trim().length > 0 ? null : "El nombre es obligatorio.";
}

export function validarUsuario(usuario: string): string | null {
  if (!usuario) return "El nombre de usuario es obligatorio.";
  if (!REGEX_USUARIO.test(usuario)) {
    return "Solo minúsculas, números, puntos y guiones bajos, entre 3 y 30 caracteres.";
  }
  return null;
}

// Mínimo bajo a propósito (no 8): es una contraseña para el personal de un
// local, que la va a tipear en una tablet compartida — más largo es más
// fricción real sin ganancia de seguridad proporcional acá. La generada
// automáticamente (ver src/lib/usuarios/password.ts) es mucho más fuerte;
// esto solo aplica cuando el dueño la elige a mano.
export function validarPasswordManual(password: string): string | null {
  if (password.length < 6) {
    return "La contraseña tiene que tener al menos 6 caracteres.";
  }
  return null;
}

export function validarSectoresAsignados(
  rol: RolAsignable,
  sectorIds: string[],
): string | null {
  if (rol === "sector" && sectorIds.length === 0) {
    return "Elegí al menos un sector.";
  }
  return null;
}
