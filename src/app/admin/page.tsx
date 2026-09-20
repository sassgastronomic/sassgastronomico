import Link from "next/link";

import { contarUsuariosOcupados } from "@/lib/miembros/plan";
import { crearClienteServidor } from "@/lib/supabase/server";
import type {
  Database,
  EstadoComercio,
  PlanComercio,
  RolMiembro,
} from "@/types/database";

type Duenio = {
  nombre: string;
  email: string | null;
};

type ComercioListado = Pick<
  Database["public"]["Tables"]["comercios"]["Row"],
  "id" | "nombre" | "slug" | "plan" | "estado" | "limite_usuarios" | "creado_en"
> & {
  usuariosOcupados: number;
  duenio: Duenio | null;
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
 * completos solo a `es_admin()`) más, de una sola consulta a `miembros`,
 * cuántos ocupan el límite de usuarios de cada uno y los datos del dueño.
 *
 * Esa consulta a `miembros` embebe el perfil por la FK `perfil_id` (misma
 * relación declarada en `Relationships` en src/types/database.ts), así que
 * es una sola ida a la base con un join — nada de una consulta por fila
 * para el dueño. Los datos de `perfiles` ya son legibles por un admin vía
 * RLS (`perfiles_propio`: "id = auth.uid() or es_admin()"), no hace falta
 * la service_role key para esto.
 *
 * El conteo usa `contarUsuariosOcupados` (src/lib/miembros/plan.ts), el
 * mismo criterio que la función SQL `usuarios_ocupados` y que el trigger
 * `validar_limite_usuarios`: activos y con un rol que el plan actual
 * permite (ej. `mozo` no cuenta en plan `take_away`). Se replica acá en vez
 * de llamar a la función por RPC una vez por comercio para no convertir
 * este listado en una consulta N+1 — ya se tiene todo lo necesario (rol,
 * activo, plan) en las dos consultas de arriba.
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
    .select("comercio_id, rol, activo, perfiles(nombre, email)")
    .order("creado_en", { ascending: true });

  if (errorMiembros) {
    return {
      comercios: null,
      error: "No se pudieron cargar los comercios. Probá de nuevo en un momento.",
    };
  }

  const miembrosPorComercio = new Map<
    string,
    { activo: boolean; rol: RolMiembro }[]
  >();
  const duenioPorComercio = new Map<string, Duenio>();

  for (const miembro of miembros) {
    const lista = miembrosPorComercio.get(miembro.comercio_id) ?? [];
    lista.push({ activo: miembro.activo, rol: miembro.rol });
    miembrosPorComercio.set(miembro.comercio_id, lista);

    // El dueño se identifica por rol, no por estar activo: aunque se lo
    // desactive, sigue siendo el titular del comercio. Ordenado por
    // creado_en asc arriba, así que si llegara a haber más de uno (no
    // debería: ver el índice único al final de supabase/schema.sql) nos
    // quedamos con el primero.
    if (
      miembro.rol === "duenio" &&
      miembro.perfiles &&
      !duenioPorComercio.has(miembro.comercio_id)
    ) {
      duenioPorComercio.set(miembro.comercio_id, {
        nombre: miembro.perfiles.nombre,
        email: miembro.perfiles.email,
      });
    }
  }

  return {
    comercios: comercios.map((comercio) => ({
      ...comercio,
      usuariosOcupados: contarUsuariosOcupados(
        miembrosPorComercio.get(comercio.id) ?? [],
        comercio.plan,
      ),
      duenio: duenioPorComercio.get(comercio.id) ?? null,
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
                        {comercio.duenio ? (
                          <p className="text-xs text-neutral-500">
                            {comercio.duenio.email ?? comercio.duenio.nombre}
                          </p>
                        ) : (
                          <p className="mt-0.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Sin dueño asignado
                          </p>
                        )}
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
                        {comercio.usuariosOcupados} / {comercio.limite_usuarios}
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
