import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { moverCategoria } from "./acciones-orden";

type CategoriaListado = {
  id: string;
  nombre: string;
  activo: boolean;
  sector: string;
  productos: number;
};

type ResultadoCategorias =
  | { categorias: CategoriaListado[]; error: null }
  | { categorias: null; error: string };

const ESTILO_BOTON_ORDEN =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Categorías del comercio (con el nombre de su sector embebido por la FK
 * `sector_id`) más, de una consulta aparte a `productos`, cuántos
 * productos activos tiene cada una (nada de una consulta por fila).
 */
async function obtenerCategorias(comercioId: string): Promise<ResultadoCategorias> {
  const supabase = await crearClienteServidor();

  const { data: categorias, error: errorCategorias } = await supabase
    .from("categorias")
    .select("id, nombre, activo, sectores(nombre)")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorCategorias || !categorias) {
    return {
      categorias: null,
      error: "No se pudieron cargar las categorías. Probá de nuevo en un momento.",
    };
  }

  const { data: productos, error: errorProductos } = await supabase
    .from("productos")
    .select("categoria_id")
    .eq("comercio_id", comercioId)
    .eq("activo", true);

  if (errorProductos) {
    return {
      categorias: null,
      error: "No se pudieron cargar las categorías. Probá de nuevo en un momento.",
    };
  }

  const productosPorCategoria = new Map<string, number>();
  for (const { categoria_id } of productos) {
    productosPorCategoria.set(
      categoria_id,
      (productosPorCategoria.get(categoria_id) ?? 0) + 1,
    );
  }

  return {
    categorias: categorias.map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      activo: categoria.activo,
      sector: categoria.sectores?.nombre ?? "—",
      productos: productosPorCategoria.get(categoria.id) ?? 0,
    })),
    error: null,
  };
}

export default async function PaginaCategorias() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const resultado = await obtenerCategorias(contexto.comercio.id);

  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Categorías</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { categorias } = resultado;

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
            Categorías
          </h1>
        </div>
        <Link
          href="/app/carta/categorias/nuevo"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Crear categoría
        </Link>
      </div>

      {categorias.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay categorías cargadas.
          </p>
          <Link
            href="/app/carta/categorias/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear categoría
          </Link>
        </div>
      )}

      {categorias.length > 0 && (
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
                  Productos
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
              {categorias.map((categoria, indice) => {
                const hrefEditar = `/app/carta/categorias/${categoria.id}`;
                const esPrimera = indice === 0;
                const esUltima = indice === categorias.length - 1;
                return (
                  <tr key={categoria.id} className="hover:bg-neutral-50">
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 font-medium text-neutral-900"
                      >
                        {categoria.nombre}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {categoria.sector}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            categoria.activo
                              ? "bg-green-50 text-green-700 ring-green-600/20"
                              : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                          }`}
                        >
                          {categoria.activo ? "Activa" : "Inactiva"}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {categoria.productos}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <form
                          action={moverCategoria.bind(
                            null,
                            categoria.id,
                            "arriba",
                          )}
                        >
                          <button
                            type="submit"
                            disabled={esPrimera}
                            aria-label={`Subir ${categoria.nombre}`}
                            className={ESTILO_BOTON_ORDEN}
                          >
                            ↑
                          </button>
                        </form>
                        <form
                          action={moverCategoria.bind(
                            null,
                            categoria.id,
                            "abajo",
                          )}
                        >
                          <button
                            type="submit"
                            disabled={esUltima}
                            aria-label={`Bajar ${categoria.nombre}`}
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
}
