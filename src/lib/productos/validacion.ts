/**
 * Validaciones compartidas por "crear producto" y "editar producto". Se
 * usan siempre del lado del servidor (adentro de las Server Actions): los
 * `required`/`min` del <form> son solo para feedback inmediato.
 *
 * No hay validarOrden: el dueño no lo maneja a mano (se asigna solo al
 * crear, y se reordena con los botones subir/bajar del listado dentro de
 * cada categoría).
 */

export function validarNombreProducto(nombre: string): string | null {
  return nombre.trim().length > 0
    ? null
    : "El nombre del producto es obligatorio.";
}

export function validarPrecio(valor: string): string | null {
  if (valor.trim() === "") {
    return "El precio es obligatorio.";
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    return "El precio tiene que ser un número mayor o igual a 0.";
  }
  return null;
}
