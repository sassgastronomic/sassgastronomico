import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Disponibilidad durante la jornada: qué productos de la carta hay y
 * cuáles se acabaron. Lo marca quien se entera primero (la cocina, el
 * mostrador), sin entrar como dueño; el `activo` ("esto ya no lo vendemos
 * más") sigue siendo cosa del dueño, en su ABM. Ver docs/SCHEMA.md,
 * "Disponibilidad durante la jornada".
 */

export type ProductoDisponibilidad = {
  id: string;
  nombre: string;
  sinStock: boolean;
};

export type CategoriaDisponibilidad = {
  id: string;
  nombre: string;
  productos: ProductoDisponibilidad[];
};

export type SectorDisponibilidad = {
  id: string;
  nombre: string;
  categorias: CategoriaDisponibilidad[];
};

/**
 * Los productos que la carta ofrece hoy, agrupados por sector y categoría
 * (en el orden de la carta), con su `sin_stock`. Con `sectorId`, solo los
 * de ese sector.
 *
 * Qué productos: los de `carta_publica`, la misma fuente de verdad que la
 * landing y el mozo (docs/ARQUITECTURA.md, "Disponibilidad efectiva"):
 * nada de rearmar acá el filtro de sector → categoría → producto. Lo que
 * la carta no ofrece (inactivo, o con su categoría o su sector apagados)
 * no aparece: marcarlo no cambiaría nada.
 *
 * De qué sector: el efectivo, `coalesce(productos.sector_id,
 * categorias.sector_id)` — carta_publica no lo trae, así que sale de una
 * consulta aparte (RLS: cualquier miembro del comercio lee productos).
 */
export async function obtenerDisponibilidad(
  comercio: { id: string; slug: string },
  sectorId?: string,
): Promise<SectorDisponibilidad[]> {
  const supabase = await crearClienteServidor();
  const [carta, productos, sectores] = await Promise.all([
    supabase.rpc("carta_publica", { p_slug: comercio.slug }),
    supabase
      .from("productos")
      .select("id, sector_id, categorias(sector_id)")
      .eq("comercio_id", comercio.id),
    supabase
      .from("sectores")
      .select("id, nombre")
      .eq("comercio_id", comercio.id)
      .order("orden", { ascending: true }),
  ]);

  // Un error de base no es "no hay productos": va al error boundary, que
  // ofrece reintentar.
  const error = carta.error ?? productos.error ?? sectores.error;
  if (error) throw new Error(`disponibilidad: ${error.message}`);

  const sectorDe = new Map(
    (productos.data ?? []).map((producto) => [
      producto.id,
      producto.sector_id ?? producto.categorias?.sector_id ?? null,
    ]),
  );

  // sector → categoría → productos, respetando el orden de la carta.
  const agrupado = new Map<string, Map<string, CategoriaDisponibilidad>>();
  for (const categoria of carta.data?.categorias ?? []) {
    for (const producto of categoria.productos) {
      const sector = sectorDe.get(producto.id);
      if (!sector || (sectorId && sector !== sectorId)) continue;

      let categorias = agrupado.get(sector);
      if (!categorias) {
        categorias = new Map();
        agrupado.set(sector, categorias);
      }
      let grupo = categorias.get(categoria.id);
      if (!grupo) {
        grupo = { id: categoria.id, nombre: categoria.nombre, productos: [] };
        categorias.set(categoria.id, grupo);
      }
      grupo.productos.push({
        id: producto.id,
        nombre: producto.nombre,
        sinStock: producto.sin_stock,
      });
    }
  }

  return (sectores.data ?? []).flatMap((sector) => {
    const categorias = agrupado.get(sector.id);
    return categorias
      ? [{ id: sector.id, nombre: sector.nombre, categorias: [...categorias.values()] }]
      : [];
  });
}
