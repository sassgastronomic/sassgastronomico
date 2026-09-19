import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarSector } from "./formulario";

export default async function PaginaEditarSector({
  params,
}: PageProps<"/app/carta/sectores/[id]">) {
  const { id } = await params;

  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // RLS: `sectores_leer` (es_miembro) ya lo permite; igual se filtra por
  // comercio_id acá para que un id de otro comercio dé 404, no un permiso
  // denegado ambiguo.
  const { data: sector } = await supabase
    .from("sectores")
    .select("id, nombre, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!sector) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/sectores"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Sectores
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        {sector.nombre}
      </h1>
      <FormularioEditarSector sector={sector} />
    </div>
  );
}
