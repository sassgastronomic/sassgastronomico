/**
 * Validaciones compartidas por "crear sector" y "editar sector". Se usan
 * siempre del lado del servidor (adentro de las Server Actions): los
 * `required`/`min` del <form> son solo para feedback inmediato.
 */

export function validarNombreSector(nombre: string): string | null {
  return nombre.trim().length > 0 ? null : "El nombre del sector es obligatorio.";
}

// No hay validarOrden: el dueño no carga ese campo a mano (se asigna solo
// al crear, ver src/app/app/carta/sectores/nuevo/actions.ts). El futuro
// reordenamiento con botones subir/bajar tampoco va a necesitar validar un
// número de texto.
