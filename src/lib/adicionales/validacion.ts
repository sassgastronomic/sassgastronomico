/**
 * Validaciones compartidas por "crear adicional" y "editar adicional". Se
 * usan siempre del lado del servidor (adentro de las Server Actions): los
 * `required`/`min` del <form> son solo para feedback inmediato.
 */

export function validarNombreAdicional(nombre: string): string | null {
  return nombre.trim().length > 0
    ? null
    : "El nombre del adicional es obligatorio.";
}

export function validarPrecioExtra(valor: string): string | null {
  if (valor.trim() === "") {
    return "El precio extra es obligatorio (0 si es gratis).";
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    return "El precio extra tiene que ser un número mayor o igual a 0.";
  }
  return null;
}
