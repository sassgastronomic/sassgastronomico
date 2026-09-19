import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Placeholder: pantalla de un sector (sprints 3 a 6). Antes eran rutas
 * fijas /app/cocina y /app/barra; ahora hay una por sector real —
 * `miembro_sectores` define qué sector ve cada miembro con rol `sector`
 * (ver docs/SCHEMA.md, reemplaza el viejo matcheo por nombre).
 *
 * Acceso: dueño (cualquier sector activo del comercio) o rol `sector` con
 * este sector puntual asignado. Otros roles no llegan acá ni por el menú,
 * pero se valida igual por si alguien entra directo por la URL.
 */
export default async function PaginaSector({
  params,
}: PageProps<"/app/sector/[id]">) {
  const { id } = await params;

  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }

  const esDuenio = contexto.rol === "duenio";
  const tieneSectorAsignado =
    contexto.rol === "sector" &&
    contexto.sectoresAsignados.some((sector) => sector.id === id);

  if (!esDuenio && !tieneSectorAsignado) {
    redirect("/app");
  }

  // RLS: `sectores_leer` (es_miembro) ya lo permite; se filtra por
  // comercio_id acá para que un id de otro comercio dé 404 en vez de un
  // permiso denegado ambiguo.
  const supabase = await crearClienteServidor();
  const { data: sector } = await supabase
    .from("sectores")
    .select("id, nombre")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!sector) {
    notFound();
  }

  return (
    <h1 className="text-xl font-semibold text-neutral-900">
      {sector.nombre}
    </h1>
  );
}
