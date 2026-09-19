import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioNuevaCategoria } from "./formulario";

export default async function PaginaNuevaCategoria() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();
  const { data: sectores } = await supabase
    .from("sectores")
    .select("id, nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("orden", { ascending: true });

  const sectoresActivos = sectores ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/categorias"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Categorías
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        Crear categoría
      </h1>

      {sectoresActivos.length === 0 ? (
        <div className="max-w-xl rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Necesitás al menos un sector activo para crear una categoría.
          </p>
          <Link
            href="/app/carta/sectores"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Ir a Sectores
          </Link>
        </div>
      ) : (
        <FormularioNuevaCategoria sectores={sectoresActivos} />
      )}
    </div>
  );
}
