let contador = 0;

/**
 * Identificador único dentro de la página, para claves de React y estado
 * local del navegador (ej. las líneas del carrito). No es un UUID ni sirve
 * para nada que se guarde en la base.
 *
 * Existe porque `crypto.randomUUID()` solo está disponible en contextos
 * seguros (https o localhost): probando desde un celular por
 * `http://192.168.x.x`, Safari no lo expone y la pantalla se rompía al
 * agregar un producto al carrito.
 */
export function idLocal(): string {
  contador += 1;
  return `${Date.now().toString(36)}-${contador.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
