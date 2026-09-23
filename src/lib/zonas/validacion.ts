/**
 * Validaciones compartidas por "crear zona" y "editar zona" (/app/mesas/zonas).
 * Se usan siempre del lado del servidor (adentro de las Server Actions): los
 * `required` del `<form>` son solo para feedback inmediato.
 *
 * No hay `validarOrden`: el dueño no lo maneja a mano (se asigna solo al
 * crear, y el reordenamiento manual con botones subir/bajar todavía no
 * existe para zonas — igual que sectores, ver docs/ARQUITECTURA.md).
 */

export function validarNombreZona(nombre: string): string | null {
  return nombre.trim().length > 0 ? null : "El nombre es obligatorio.";
}
