import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

type AdicionalListado = {
  id: string;
  nombre: string;
  precioExtra: number;
  activo: boolean;
  productos: number;
};

type ResultadoAdicionales =
  | { adicionales: AdicionalListado[]; error: null }
  | { adicionales: null; error: string };

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

/**
 * Adicionales del comercio más, de una consulta aparte a
 * `producto_adicionales` (con el estado del producto embebido por la FK
 * `producto_id`), en cuántos productos activos está asignado cada uno.
 * Nada de una consulta por fila.
 */
async function obtenerAdicionales(
  comercioId: string,
): Promise<ResultadoAdicionales> {
  const supabase = await crearClienteServidor();

  const { data: adicionales, error: errorAdicionales } = await supabase
    .from("adicionales")
    .select("id, nombre, precio_extra, activo")
    .eq("comercio_id", comercioId)
    .order("nombre", { ascending: true });

  if (errorAdicionales || !adicionales) {
    return {
      adicionales: null,
      error: "No se pudieron cargar los adicionales. Probá de nuevo en un momento.",
    };
  }

  const { data: asignaciones, error: errorAsignaciones } = await supabase
    .from("producto_adicionales")
    .select("adicional_id, productos(activo)")
    .eq("comercio_id", comercioId);

  if (errorAsignaciones) {
    return {
      adicionales: null,
      error: "No se pudieron cargar los adicionales. Probá de nuevo en un momento.",
    };
  }

  const productosPorAdicional = new Map<string, number>();
  for (const asignacion of asignaciones) {
    if (!asignacion.productos?.activo) continue;
    productosPorAdicional.set(
      asignacion.adicional_id,
      (productosPorAdicional.get(asignacion.adicional_id) ?? 0) + 1,
    );
  }

  return {
    adicionales: adicionales.map((adicional) => ({
      id: adicional.id,
      nombre: adicional.nombre,
      precioExtra: adicional.precio_extra,
      activo: adicional.activo,
      productos: productosPorAdicional.get(adicional.id) ?? 0,
    })),
    error: null,
  };
}

export default async function PaginaAdicionales() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const resultado = await obtenerAdicionales(contexto.comercio.id);

  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Adicionales</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { adicionales } = resultado;

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
            Adicionales
          </h1>
        </div>
        <Link
          href="/app/carta/adicionales/nuevo"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Crear adicional
        </Link>
      </div>

      {adicionales.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay adicionales cargados.
          </p>
          <Link
            href="/app/carta/adicionales/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear adicional
          </Link>
        </div>
      )}

      {adicionales.length > 0 && (
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
                  Precio extra
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
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {adicionales.map((adicional) => {
                const hrefEditar = `/app/carta/adicionales/${adicional.id}`;
                return (
                  <tr key={adicional.id} className="hover:bg-neutral-50">
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 font-medium text-neutral-900"
                      >
                        {adicional.nombre}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {adicional.precioExtra === 0
                          ? "Sin cargo"
                          : formateadorPrecio.format(adicional.precioExtra)}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={hrefEditar} className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            adicional.activo
                              ? "bg-green-50 text-green-700 ring-green-600/20"
                              : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                          }`}
                        >
                          {adicional.activo ? "Activo" : "Inactivo"}
                        </span>
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={hrefEditar}
                        className="block px-4 py-3 text-neutral-700"
                      >
                        {adicional.productos}
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
