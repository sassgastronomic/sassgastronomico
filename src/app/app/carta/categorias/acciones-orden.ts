"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Sube o baja una categoría intercambiando su `orden` con el de la fila
 * vecina, según el orden actual (orden asc, nombre asc — mismo criterio
 * que el listado en page.tsx).
 *
 * Pensada para invocarse desde un <form action={moverCategoria.bind(null,
 * id, direccion)}> por fila, sin useActionState: no hay nada que el
 * usuario tenga que corregir a mano, y los botones ya vienen
 * deshabilitados en los bordes (primera no sube, última no baja). Si de
 * todos modos se invoca en un caso inválido (o el id no existe), no hace
 * nada — no hay un estado de error que mostrar acá.
 */
export async function moverCategoria(
  id: string,
  direccion: "arriba" | "abajo",
  _formData: FormData,
): Promise<void> {
  // Next.js llama a esta función con el FormData del <form> como último
  // argumento (por el .bind(null, id, direccion) en page.tsx), aunque acá
  // no haga falta leer nada de él.
  void _formData;

  // Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: categorias, error } = await supabase
    .from("categorias")
    .select("id, orden")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error || !categorias) {
    return;
  }

  const indice = categorias.findIndex((categoria) => categoria.id === id);
  if (indice === -1) return;

  const indiceVecino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (indiceVecino < 0 || indiceVecino >= categorias.length) return;

  const actual = categorias[indice];
  const vecino = categorias[indiceVecino];

  // RLS: `categorias_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorActual } = await supabase
    .from("categorias")
    .update({ orden: vecino.orden })
    .eq("id", actual.id)
    .eq("comercio_id", contexto.comercio.id);
  if (errorActual) return;

  const { error: errorVecino } = await supabase
    .from("categorias")
    .update({ orden: actual.orden })
    .eq("id", vecino.id)
    .eq("comercio_id", contexto.comercio.id);
  if (errorVecino) return;

  revalidatePath("/app/carta/categorias");
}
