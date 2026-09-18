import Link from "next/link";

import type { Database, EstadoComercio, PlanComercio } from "@/types/database";
import { crearClienteServidor } from "@/lib/supabase/server";

type ComercioListado = Pick<
  Database["public"]["Tables"]["comercios"]["Row"],
  "id" | "nombre" | "slug" | "plan" | "estado" | "limite_usuarios" | "creado_en"
> & {
  miembros_activos: number;
};

type ResultadoComercios =
  | { comercios: ComercioListado[]; error: null }
  | { comercios: null; error: string };

const ETIQUETA_PLAN: Record<PlanComercio, string> = {
  take_away: "Take away",
  salon: "Salón",
  completo: "Completo",
};

const COLOR_PLAN: Record<PlanComercio, string> = {
  take_away: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  salon: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20",
  completo: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
};

const ETIQUETA_ESTADO: Record<EstadoComercio, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
};

const COLOR_ESTADO: Record<EstadoComercio, string> = {
  activo: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20",
  suspendido: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
};

const formateadorFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Trae todos los comercios (la policy `comercios_admin` los deja ver
 * completos solo a `es_admin()`) más la cantidad de miembros activos de
 * cada uno.
 *
 * Nota: "miembros activos" acá es el conteo simple de `miembros.activo =
 * true`, no `usuarios_ocupados()` (la función SQL que además descuenta los
 * roles que el plan actual no permite, como `mozo` en plan `take_away`, ver
 * docs/SCHEMA.md). Para este listado alcanza con el conteo simple; si más
 * adelante hace falta el número exacto que usa el trigger de límite,
 * conviene llamar a esa función por RPC en vez de reimplementar la regla acá.
 */
async function obtenerComercios(): Promise<ResultadoComercios> {
  const supabase = await crearClienteServidor();

  const { data: comercios, error: errorComercios } = await supabase
    .from("comercios")
    .select("id, nombre, slug, plan, estado, limite_usuarios, creado_en")
    .order("creado_en", { ascending: false });

  if (errorComercios || !comercios) {
    return {
      comercios: null,
      error: "No se pudieron cargar los comercios. Probá de nuevo en un momento.",
    };
  }

  const { data: miembros, error: errorMiembros } = await supabase
    .from("miembros")
    .select("comercio_id")
    .eq("activo", true);

  if (errorMiembros) {
    return {
      comercios: null,
      error: "No se pudieron cargar los comercios. Probá de nuevo en un momento.",
    };
  }

  const activosPorComercio = new Map<string, number>();
  for (const { comercio_id } of miembros) {
    activosPorComercio.set(
      comercio_id,
      (activosPorComercio.get(comercio_id) ?? 0) + 1,
    );
  }

  return {
    comercios: comercios.map((comercio) => ({
      ...comercio,
      miembros_activos: activosPorComercio.get(comercio.id) ?? 0,
    })),
    error: null,
  };
}

export default async function PaginaAdmin() {
  const resultado = await obtenerComercios();

  // Guard clause en vez de desestructurar `{ comercios, error }` juntos:
  // desestructurar rompe la correlación del union discriminado y TypeScript
  // ya no puede probar que `comercios` es no-nulo cuando `error` es null.
  // Comparación explícita con `null` (no truthy): `error` es `string`, no
  // un literal, y TypeScript no puede descartar un `""` falsy que igual
  // correspondería a la rama con error.
  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Comercios</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { comercios } = resultado;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Comercios</h1>

      {comercios.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay comercios cargados.
          </p>
          <Link
            href="/admin/comercios/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear comercio
          </Link>
        </div>
      )}

      {comercios.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Comercio
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Plan
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
                  Usuarios
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Creado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {comercios.map((comercio) => {
                const hrefEditar = `/admin/comercios/${comercio.id}`;
                return (
                  <tr key={comercio.id} className="hover:bg-neutral-50">
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <p className="font-medium text-neutral-900">
                          {comercio.nombre}
                        </p>
                        <p className="text-xs text-neutral-500">
                          /{comercio.slug}
                        </p>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR_PLAN[comercio.plan]}`}
                        >
                          {ETIQUETA_PLAN[comercio.plan]}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR_ESTADO[comercio.estado]}`}
                        >
                          {ETIQUETA_ESTADO[comercio.estado]}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {comercio.miembros_activos} / {comercio.limite_usuarios}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-500"
                      >
                        {formateadorFecha.format(new Date(comercio.creado_en))}
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
