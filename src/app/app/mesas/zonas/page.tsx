import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

type ZonaListado = {
  id: string;
  nombre: string;
  activo: boolean;
  mesas: number;
};

type ResultadoZonas =
  | { zonas: ZonaListado[]; error: null }
  | { zonas: null; error: string };

/**
 * Zonas del comercio más, de una consulta aparte a `mesas`, cuántas mesas
 * activas tiene asignada cada una (nada de una consulta por fila).
 */
async function obtenerZonas(comercioId: string): Promise<ResultadoZonas> {
  const supabase = await crearClienteServidor();

  const { data: zonas, error: errorZonas } = await supabase
    .from("zonas")
    .select("id, nombre, activo")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorZonas || !zonas) {
    return {
      zonas: null,
      error: "No se pudieron cargar las zonas. Probá de nuevo en un momento.",
    };
  }

  const { data: mesas, error: errorMesas } = await supabase
    .from("mesas")
    .select("zona_id")
    .eq("comercio_id", comercioId)
    .eq("activo", true);

  if (errorMesas) {
    return {
      zonas: null,
      error: "No se pudieron cargar las zonas. Probá de nuevo en un momento.",
    };
  }

  const mesasPorZona = new Map<string, number>();
  for (const { zona_id } of mesas) {
    mesasPorZona.set(zona_id, (mesasPorZona.get(zona_id) ?? 0) + 1);
  }

  return {
    zonas: zonas.map((zona) => ({
      ...zona,
      mesas: mesasPorZona.get(zona.id) ?? 0,
    })),
    error: null,
  };
}

export default async function PaginaZonas() {
  // Autorización propia, sin depender del menú: solo dueño, y solo si el
  // plan incluye salón.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  const resultado = await obtenerZonas(contexto.comercio.id);

  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Zonas</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { zonas } = resultado;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/app/mesas"
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            ← Mesas
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">
            Zonas
          </h1>
        </div>
        <Link
          href="/app/mesas/zonas/nuevo"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Crear zona
        </Link>
      </div>

      {zonas.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay zonas cargadas.
          </p>
          <Link
            href="/app/mesas/zonas/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear zona
          </Link>
        </div>
      )}

      {zonas.length > 0 && (
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
                  Mesas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {zonas.map((zona) => {
                const hrefEditar = `/app/mesas/zonas/${zona.id}`;
                return (
                  <tr key={zona.id} className="hover:bg-neutral-50">
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 font-medium text-neutral-900"
                      >
                        {zona.nombre}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            zona.activo
                              ? "bg-green-50 text-green-700 ring-green-600/20"
                              : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                          }`}
                        >
                          {zona.activo ? "Activa" : "Inactiva"}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {zona.mesas}
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
