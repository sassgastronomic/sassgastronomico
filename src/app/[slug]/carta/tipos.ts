/**
 * La carta tal como la usan las pantallas del cliente, ya traducida de lo
 * que devuelve `carta_publica` (nombres en camelCase, `sinStock` en vez de
 * `sin_stock`, el nombre de la categoría copiado en cada producto para no
 * tener que buscarlo).
 *
 * Las dos pantallas que la muestran son la landing de take away
 * (`/{slug}`) y el pedido por QR de mesa (`/{slug}/mesa`). Comparten la
 * carta, el carrito y la navegación; se diferencian en lo que pasa al
 * confirmar. Ver ./piezas.tsx, ./usar-carrito.ts y ./vistas.ts.
 */

export type AdicionalCarta = {
  id: string;
  nombre: string;
  precioExtra: number;
};

export type ProductoCarta = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  descripcion: string | null;
  precio: number;
  sinStock: boolean;
  adicionales: AdicionalCarta[];
};

export type CategoriaCarta = {
  id: string;
  nombre: string;
  productos: ProductoCarta[];
};

/**
 * Una línea del carrito tal como se muestra: nombre, precio y adicionales
 * salen de la carta actual, no de lo guardado en el celular. Si el
 * producto ya no se puede pedir, `subtotal` es null y `motivo` dice por
 * qué (no se saca solo: el cliente tiene que enterarse).
 */
export type LineaVista = {
  clave: string;
  productoId: string;
  nombre: string;
  categoriaNombre: string | null;
  cantidad: number;
  nota: string;
  adicionales: AdicionalCarta[];
  subtotal: number | null;
  motivo: string | null;
};
