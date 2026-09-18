import Link from "next/link";
import { notFound } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarComercio } from "./formulario";

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

      <FormularioEditarComercio comercio={comercio} />
    </div>
  );
}
