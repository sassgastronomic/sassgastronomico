import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { validarSlug } from "@/lib/comercios/validacion";
import { crearClientePublico } from "@/lib/supabase/publico";
import type { CartaPublicaResultado } from "@/types/database";

import type { CategoriaCarta } from "./carta/tipos";

/**
 * La carta de un comercio para las pantallas públicas del cliente: la
 * landing de take away (`/{slug}`) y el pedido por QR de mesa
 * (`/{slug}/mesa`).
 *
 * Sale de `carta_publica` — la misma fuente de verdad que la vista previa
 * del dueño y la carga del mozo: ya filtra la disponibilidad efectiva
 * (sector → categoría → producto). A diferencia del mozo, acá los
 * `sin_stock` se muestran (en gris): el cliente tiene que entender por qué
 * no puede pedirlo.
 */

export type CartaLeida = CartaPublicaResultado & {
  /**
   * Cuándo se leyó de la base (reloj del servidor). La pantalla lo compara
   * con el estado del local que va consultando después
   * (./vigilar-estado-local.tsx), para no pisar esta carta con uno más
   * viejo.
   */
  leidaEn: number;
};

/**
 * `cache` para que `generateMetadata` y la página hagan una sola consulta.
 * `connection()`: el cliente público no lee cookies, así que sin esto Next
 * podría prerenderizar la carta y servirla vieja.
 */
export const obtenerCarta = cache(
  async (slug: string): Promise<CartaLeida | null> => {
    await connection();
    if (validarSlug(slug) !== null) return null;

    const supabase = crearClientePublico();
    const leidaEn = Date.now();
    const { data, error } = await supabase.rpc("carta_publica", {
      p_slug: slug,
    });
    // Un error de base no es "no existe": va al error boundary (con
    // "Reintentar"), no a la página de local no disponible.
    if (error) throw new Error(`carta_publica: ${error.message}`);
    return data ? { ...data, leidaEn } : null;
  },
);

/**
 * De la forma que devuelve la base a la que usan las pantallas. Se dejan
 * afuera las categorías sin productos (una categoría vacía solo ocupa
 * lugar en la barra) y se copia el nombre de la categoría en cada
 * producto, que es como lo muestran la tarjeta y la hoja.
 */
export function aCategoriasCarta(carta: CartaLeida): CategoriaCarta[] {
  return carta.categorias
    .filter((categoria) => categoria.productos.length > 0)
    .map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      productos: categoria.productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        categoriaNombre: categoria.nombre,
        descripcion: producto.descripcion,
        precio: producto.precio,
        sinStock: producto.sin_stock,
        adicionales: producto.adicionales.map((adicional) => ({
          id: adicional.id,
          nombre: adicional.nombre,
          precioExtra: adicional.precio_extra,
        })),
      })),
    }));
}
