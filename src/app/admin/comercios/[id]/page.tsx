import Link from "next/link";
import { notFound } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarComercio } from "./formulario";

const formateadorFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function PaginaEditarComercio({
  params,
}: PageProps<"/admin/comercios/[id]">) {
  const { id } = await params;

  const supabase = await crearClienteServidor();

  // RLS: `comercios_admin` exige `es_admin()`. Un id inexistente o mal
  // formado (no-UUID) también cae en `!comercio` → 404, no hace falta
  // distinguir el motivo acá.
  const { data: comercio } = await supabase
    .from("comercios")
    .select("id, nombre, slug, plan, estado, limite_usuarios")
    .eq("id", id)
    .single();

  if (!comercio) {
    notFound();
  }

  // El dueño, con su perfil embebido por la FK `perfil_id` (misma relación
  // declarada en src/types/database.ts) — una sola consulta, sin service_role:
  // `perfiles` ya es legible por un admin vía RLS (`perfiles_propio`).
  // `.limit(1)` + `.maybeSingle()` en vez de `.single()`: no encontrar dueño
  // es un caso válido (falló un rollback), no un error.
  const { data: duenio, error: errorDuenio } = await supabase
    .from("miembros")
    .select("creado_en, perfiles(nombre, email)")
    .eq("comercio_id", comercio.id)
    .eq("rol", "duenio")
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Comercios
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">
          {comercio.nombre}
        </h1>
        <p className="text-sm text-neutral-500">
          /{comercio.slug} (el slug no se puede editar)
        </p>
      </div>

      <section className="max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Dueño</h2>

        {errorDuenio ? (
          <p className="text-sm text-red-700">
            No se pudo cargar el dueño. Probá de nuevo en un momento.
          </p>
        ) : duenio?.perfiles ? (
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-500">Nombre</dt>
              <dd className="text-neutral-900">{duenio.perfiles.nombre}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-500">Email</dt>
              <dd className="text-neutral-900">
                {duenio.perfiles.email ?? "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-500">Miembro desde</dt>
              <dd className="text-neutral-900">
                {formateadorFecha.format(new Date(duenio.creado_en))}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            Sin dueño asignado
          </p>
        )}
      </section>

      <FormularioEditarComercio comercio={comercio} />
    </div>
  );
}
