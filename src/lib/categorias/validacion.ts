/**
 * Validaciones compartidas por "crear categoría" y "editar categoría". Se
 * usan siempre del lado del servidor (adentro de las Server Actions): los
 * `required` del <form> son solo para feedback inmediato.
 *
 * No hay validarOrden: el dueño no lo maneja a mano (se asigna solo al
 * crear, y se reordena con los botones subir/bajar del listado, no con un
 * campo numérico).
 */

export function validarNombreCategoria(nombre: string): string | null {
  return nombre.trim().length > 0
    ? null
    : "El nombre de la categoría es obligatorio.";
}
