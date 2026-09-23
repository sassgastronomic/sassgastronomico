import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { alternarSinStock, moverProducto } from "./acciones-listado";

type CategoriaCompleta = {
  id: string;
  nombre: string;
  activo: boolean;
  sectorNombre: string;
  sectorActivo: boolean;
};

type ProductoListado = {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
  sinStock: boolean;
  sector: string;
  categoriaId: string;
};

type ResultadoProductos =
  | {
      categorias: CategoriaCompleta[];
      productosPorCategoria: Map<string, ProductoListado[]>;
      error: null;
    }
  | { categorias: null; productosPorCategoria: null; error: string };

const ESTILO_BOTON_ORDEN =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40";

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

/**
 * Productos, agrupados por categoría (la lista de categorías —con el
 * nombre de su sector ya resuelto— la trae la página, para no repetir esa
 * consulta con la de las "pastillas" del filtro). Una sola consulta acá,
 * nada de una por fila. Si `categoriaId` viene, se filtra a esa sola
 * categoría.
 *
 * El sector que se muestra es siempre el de la categoría: un producto se
 * prepara en el sector de su categoría, sin excepción (decisión de
 * negocio, ver docs/SCHEMA.md) — no hace falta mirar el `sector_id` propio
 * del producto para nada acá.
 */
async function obtenerProductos(
  comercioId: string,
  categorias: CategoriaCompleta[],
  categoriaId: string | undefined,
): Promise<ResultadoProductos> {
  const supabase = await crearClienteServidor();

  const categoriasVisibles = categoriaId
    ? categorias.filter((c) => c.id === categoriaId)
    : categorias;

  let consultaProductos = supabase
    .from("productos")
    .select("id, nombre, precio, activo, sin_stock, orden, categoria_id")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (categoriaId) {
    consultaProductos = consultaProductos.eq("categoria_id", categoriaId);
  }

  const { data: productos, error: errorProductos } = await consultaProductos;

  if (errorProductos || !productos) {
    return {
      categorias: null,
      productosPorCategoria: null,
      error: "No se pudieron cargar los productos. Probá de nuevo en un momento.",
    };
  }

  const sectorPorCategoria = new Map(
    categorias.map((c) => [c.id, c.sectorNombre]),
  );

  const productosPorCategoria = new Map<string, ProductoListado[]>();
  for (const producto of productos) {
    const sector = sectorPorCategoria.get(producto.categoria_id) ?? "—";

    const lista = productosPorCategoria.get(producto.categoria_id) ?? [];
    lista.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      activo: producto.activo,
      sinStock: producto.sin_stock,
      sector,
      categoriaId: producto.categoria_id,
    });
    productosPorCategoria.set(producto.categoria_id, lista);
  }

  return {
    categorias: categoriasVisibles,
    productosPorCategoria,
    error: null,
  };
}

export default async function PaginaProductos({
  searchParams,
}: PageProps<"/app/carta/productos">) {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const parametros = await searchParams;
  const categoriaFiltro =
    typeof parametros.categoria === "string" ? parametros.categoria : undefined;

  // Todas las categorías (para las "pastillas" del filtro y para agrupar
  // los productos), con el nombre de su sector embebido por la FK
  // `sector_id` (ver Relationships en src/types/database.ts), sin aplicar
  // el recorte todavía.
  const supabase = await crearClienteServidor();
  const { data: categoriasCrudo } = await supabase
    .from("categorias")
    .select("id, nombre, activo, sectores(nombre, activo)")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const todasLasCategorias: CategoriaCompleta[] = (categoriasCrudo ?? []).map(
    (categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      activo: categoria.activo,
      sectorNombre: categoria.sectores?.nombre ?? "—",
      sectorActivo: categoria.sectores?.activo ?? false,
    }),
  );

  const resultado = await obtenerProductos(
    contexto.comercio.id,
    todasLasCategorias,
    categoriaFiltro,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/app/carta"
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            ← Carta
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">
            Productos
          </h1>
        </div>
        <Link
          href={
            categoriaFiltro
              ? `/app/carta/productos/nuevo?categoria=${categoriaFiltro}`
              : "/app/carta/productos/nuevo"
          }
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Crear producto
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/carta/productos"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            !categoriaFiltro
              ? "bg-neutral-900 text-white"
              : "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-100"
          }`}
        >
          Todas
        </Link>
        {(todasLasCategorias ?? []).map((categoria) => (
          <Link
            key={categoria.id}
            href={`/app/carta/productos?categoria=${categoria.id}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              categoriaFiltro === categoria.id
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-100"
            }`}
          >
            {categoria.nombre}
            {!categoria.activo && " (inactiva)"}
          </Link>
        ))}
      </div>

      {resultado.error !== null && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      )}

      {resultado.error === null && resultado.categorias.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="text-sm text-neutral-500">
            No hay categorías que coincidan con este filtro.
          </p>
        </div>
      )}

      {resultado.error === null &&
        resultado.categorias.map((categoria) => {
          const productos =
            resultado.productosPorCategoria.get(categoria.id) ?? [];

          return (
            <div key={categoria.id} className="space-y-3">
              <h2 className="text-sm font-semibold text-neutral-900">
                {categoria.nombre}
                {!categoria.activo && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    (categoría inactiva)
                  </span>
                )}
                {categoria.activo && !categoria.sectorActivo && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    (sector inactivo)
                  </span>
                )}
              </h2>

              {productos.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Todavía no hay productos en esta categoría.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-neutral-200 text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium text-neutral-500"
                        >
                          Nombre
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium text-neutral-500"
                        >
                          Precio
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium text-neutral-500"
                        >
                          Sector
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium text-neutral-500"
                        >
                          Estado
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium text-neutral-500"
                        >
                          Stock
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium text-neutral-500"
                        >
                          Orden
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {productos.map((producto, indice) => {
                        const hrefEditar = `/app/carta/productos/${producto.id}`;
                        const esPrimero = indice === 0;
                        const esUltimo = indice === productos.length - 1;
                        return (
                          <tr key={producto.id} className="hover:bg-neutral-50">
                            <td className="p-0">
                              <Link
                                href={hrefEditar}
                                className="block px-4 py-3 font-medium text-neutral-900"
                              >
                                {producto.nombre}
                              </Link>
                            </td>
                            <td className="p-0">
                              <Link
                                href={hrefEditar}
                                className="block px-4 py-3 text-neutral-700"
                              >
                                {formateadorPrecio.format(producto.precio)}
                              </Link>
                            </td>
                            <td className="p-0">
                              <Link
                                href={hrefEditar}
                                className="block px-4 py-3 text-neutral-700"
                              >
                                {producto.sector}
                              </Link>
                            </td>
                            <td className="p-0">
                              <Link href={hrefEditar} className="block px-4 py-3">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                    producto.activo
                                      ? "bg-green-50 text-green-700 ring-green-600/20"
                                      : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                                  }`}
                                >
                                  {producto.activo ? "Activo" : "Inactivo"}
                                </span>
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <form
                                action={alternarSinStock.bind(null, producto.id)}
                              >
                                <button
                                  type="submit"
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition ${
                                    producto.sinStock
                                      ? "bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100"
                                      : "bg-neutral-50 text-neutral-500 ring-neutral-300 hover:bg-neutral-100"
                                  }`}
                                >
                                  {producto.sinStock ? "Sin stock" : "Con stock"}
                                </button>
                              </form>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <form
                                  action={moverProducto.bind(
                                    null,
                                    producto.id,
                                    "arriba",
                                  )}
                                >
                                  <button
                                    type="submit"
                                    disabled={esPrimero}
                                    aria-label={`Subir ${producto.nombre}`}
                                    className={ESTILO_BOTON_ORDEN}
                                  >
                                    ↑
                                  </button>
                                </form>
                                <form
                                  action={moverProducto.bind(
                                    null,
                                    producto.id,
                                    "abajo",
                                  )}
                                >
                                  <button
                                    type="submit"
                                    disabled={esUltimo}
                                    aria-label={`Bajar ${producto.nombre}`}
                                    className={ESTILO_BOTON_ORDEN}
                                  >
                                    ↓
                                  </button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
