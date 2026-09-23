import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Placeholder: pantalla de un sector (sprints 3 a 6). Antes eran rutas
 * fijas /app/cocina y /app/barra; ahora hay una por sector real —
 * `miembro_sectores` define qué sector ve cada miembro con rol `sector`
 * (ver docs/SCHEMA.md, reemplaza el viejo matcheo por nombre).
 *
 * Acceso: dueño o rol `sector` con este sector puntual asignado, esté
 * activo o no. Otros roles no llegan acá ni por el menú, pero se valida
 * igual por si alguien entra directo por la URL.
 *
 * A propósito NO se bloquea un sector inactivo (a diferencia de una mesa
 * cuya zona está inactiva, que sí se bloquea): esta pantalla va a mostrar
 * y dejar accionar pedidos ya tomados, no editar datos — un sector
 * apagado puede seguir teniendo pedidos pendientes de entregar, y
 * bloquear la pantalla dejaría esos pedidos sin nadie que los vea. Solo
 * se avisa que está inactivo, para que no se lo confunda con uno
 * operando con normalidad (mismo criterio de "no cascada, cada pantalla
 * avisa lo que corresponda" del resto de la carta — ver docs/SCHEMA.md).
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
    .select("id, nombre, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!sector) {
    notFound();
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-neutral-900">
        {sector.nombre}
      </h1>
      {!sector.activo && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este sector está inactivo. Puede tener pedidos pendientes de antes
          de apagarlo, pero no debería estar recibiendo pedidos nuevos.
        </p>
      )}
    </div>
  );
}
