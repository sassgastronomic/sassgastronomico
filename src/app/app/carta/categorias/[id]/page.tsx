import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarCategoria } from "./formulario";

export default async function PaginaEditarCategoria({
  params,
}: PageProps<"/app/carta/categorias/[id]">) {
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

  // RLS: `categorias_leer` (es_miembro) ya lo permite; igual se filtra por
  // comercio_id acá para que un id de otro comercio dé 404, no un permiso
  // denegado ambiguo.
  const { data: categoria } = await supabase
    .from("categorias")
    .select("id, nombre, sector_id, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!categoria) {
    notFound();
  }

  // Todos los sectores del comercio (no solo los activos): si el sector
  // actual de la categoría ya no está activo, tiene que poder seguir
  // apareciendo seleccionado en vez de romper el <select>.
  const { data: sectores } = await supabase
    .from("sectores")
    .select("id, nombre, activo")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: true });

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/categorias"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Categorías
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        {categoria.nombre}
      </h1>
      <FormularioEditarCategoria categoria={categoria} sectores={sectores ?? []} />
    </div>
  );
}
