import type { EstadoComercio, PlanComercio } from "@/types/database";

/**
 * Validaciones compartidas por "crear comercio" y "editar comercio".
 * Se usan siempre del lado del servidor (adentro de las Server Actions):
 * los `required`/`pattern` del `<form>` son solo para feedback inmediato,
 * no reemplazan esto.
 */

const PLANES_VALIDOS: readonly PlanComercio[] = ["take_away", "salon", "completo"];
const ESTADOS_VALIDOS: readonly EstadoComercio[] = ["activo", "suspendido"];

// Mismo patrón que el check de `comercios.slug` en supabase/migrations/.
const REGEX_SLUG = /^[a-z0-9-]+$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esPlanValido(valor: string): valor is PlanComercio {
  return (PLANES_VALIDOS as readonly string[]).includes(valor);
}

export function esEstadoValido(valor: string): valor is EstadoComercio {
  return (ESTADOS_VALIDOS as readonly string[]).includes(valor);
}

export function validarNombreComercio(nombre: string): string | null {
  return nombre.trim().length > 0
    ? null
    : "El nombre del comercio es obligatorio.";
}

export function validarSlug(slug: string): string | null {
  if (!slug) return "El slug es obligatorio.";
  if (!REGEX_SLUG.test(slug)) {
    return "El slug solo puede tener minúsculas, números y guiones (sin espacios ni acentos).";
  }
  return null;
}

export function validarLimiteUsuarios(valor: string): string | null {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    return "El límite de usuarios tiene que ser un número entero mayor a 0.";
  }
  return null;
}

export function validarNombreDuenio(nombre: string): string | null {
  return nombre.trim().length > 0 ? null : "El nombre del dueño es obligatorio.";
}

export function validarEmail(email: string): string | null {
  if (!email) return "El email del dueño es obligatorio.";
  if (!REGEX_EMAIL.test(email)) return "Ingresá un email válido para el dueño.";
  return null;
}

export function validarPassword(password: string): string | null {
  if (password.length < 8) {
    return "La contraseña tiene que tener al menos 8 caracteres.";
  }
  return null;
}
