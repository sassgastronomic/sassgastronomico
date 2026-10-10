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

// La landing de cada comercio vive en /{slug}, al mismo nivel que las
// rutas propias de la app: un comercio con uno de estos slugs quedaría
// tapado por esa ruta y su landing no se vería nunca. "api" no existe
// todavía, se reserva para no tener que mover a nadie el día que exista.
const SLUGS_RESERVADOS: readonly string[] = ["admin", "app", "login", "api"];

// WhatsApp del local tal como lo pide wa.me: solo dígitos, con código de
// país (mismo check que `comercios.whatsapp`).
const REGEX_WHATSAPP = /^[0-9]{8,15}$/;

export function esPlanValido(valor: string): valor is PlanComercio {
  return (PLANES_VALIDOS as readonly string[]).includes(valor);
}

export function esEstadoValido(valor: string): valor is EstadoComercio {
  return (ESTADOS_VALIDOS as readonly string[]).includes(valor);
}

// Plan con take away (landing y pedidos online): todos menos el de solo
// salón. Misma regla que crear_pedido_landing en la base.
export function planPermiteTakeAway(plan: PlanComercio): boolean {
  return plan !== "salon";
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
  if (SLUGS_RESERVADOS.includes(slug)) {
    return "Ese slug lo usa el sistema para sus propias pantallas: elegí otro.";
  }
  return null;
}

/**
 * Lo que tipea el admin ("+54 9 11 2233-4455") pasado a como se guarda
 * ("5491122334455"). Vacío = el local no tiene WhatsApp cargado.
 */
export function normalizarWhatsapp(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function validarWhatsapp(digitos: string): string | null {
  if (!digitos) return null;
  if (!REGEX_WHATSAPP.test(digitos)) {
    return "El WhatsApp tiene que tener entre 8 y 15 números, con el código de país (ej. 54 9 11 2233-4455).";
  }
  // Argentina: característica + número son siempre 10 dígitos, así que en
  // formato internacional un celular (54 9 …) tiene 13 y un fijo (54 …) 12.
  // Así se atrapan los dos errores típicos — dejar el 0 de la
  // característica o el 15 —, que wa.me no avisa: solo dice que el número
  // no está en WhatsApp.
  if (digitos.startsWith("54")) {
    const esperado = digitos.startsWith("549") ? 13 : 12;
    if (digitos.length !== esperado) {
      return "Revisá el número: para Argentina va 54 9, la característica sin el 0 y el número sin el 15 (ej. 54 9 11 2233-4455).";
    }
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
