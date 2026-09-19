import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

type SectorListado = {
  id: string;
  nombre: string;
  activo: boolean;
  categorias: number;
};

type ResultadoSectores =
  | { sectores: SectorListado[]; error: null }
  | { sectores: null; error: string };

/**
 * Sectores del comercio más, de una consulta aparte a `categorias`, cuántas
 * categorías activas tiene asignada cada uno (nada de una consulta por
 * fila). El dueño no maneja `orden` a mano (ver ./nuevo/actions.ts), pero
 * el listado igual ordena por ese campo, y ante empate por nombre.
 */
async function obtenerSectores(comercioId: string): Promise<ResultadoSectores> {
  const supabase = await crearClienteServidor();

  const { data: sectores, error: errorSectores } = await supabase
    .from("sectores")
    .select("id, nombre, activo")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorSectores || !sectores) {
    return {
      sectores: null,
      error: "No se pudieron cargar los sectores. Probá de nuevo en un momento.",
    };
  }

  const { data: categorias, error: errorCategorias } = await supabase
    .from("categorias")
    .select("sector_id")
    .eq("comercio_id", comercioId)
    .eq("activo", true);

  if (errorCategorias) {
    return {
      sectores: null,
      error: "No se pudieron cargar los sectores. Probá de nuevo en un momento.",
    };
  }

  const categoriasPorSector = new Map<string, number>();
  for (const { sector_id } of categorias) {
    categoriasPorSector.set(
      sector_id,
      (categoriasPorSector.get(sector_id) ?? 0) + 1,
    );
  }

  return {
    sectores: sectores.map((sector) => ({
      ...sector,
      categorias: categoriasPorSector.get(sector.id) ?? 0,
    })),
    error: null,
  };
}

export default async function PaginaSectores() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const resultado = await obtenerSectores(contexto.comercio.id);

  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Sectores</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { sectores } = resultado;

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
            Sectores
          </h1>
        </div>
        <Link
          href="/app/carta/sectores/nuevo"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Crear sector
        </Link>
      </div>

      {sectores.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay sectores cargados.
          </p>
          <Link
            href="/app/carta/sectores/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear sector
          </Link>
        </div>
      )}

      {sectores.length > 0 && (
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
                  Estado
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Categorías
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sectores.map((sector) => {
                const hrefEditar = `/app/carta/sectores/${sector.id}`;
                return (
                  <tr key={sector.id} className="hover:bg-neutral-50">
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 font-medium text-neutral-900"
                      >
                        {sector.nombre}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            sector.activo
                              ? "bg-green-50 text-green-700 ring-green-600/20"
                              : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                          }`}
                        >
                          {sector.activo ? "Activo" : "Inactivo"}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {sector.categorias}
                      </Link>
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
