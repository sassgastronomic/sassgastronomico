"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validarNombreCategoria } from "@/lib/categorias/validacion";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoEditarCategoria = "nombre" | "sector_id" | "activo";

export type EstadoEditarCategoria = {
  error?: string;
  campo?: CampoEditarCategoria;
  valores?: { nombre: string; sectorId: string; activo: string };
};

/**
 * Actualiza nombre, sector y activo/inactivo de una categoría. El orden no
 * se toca acá: se reordena desde el listado con los botones subir/bajar
 * (ver ../acciones-orden.ts).
 *
 * Reglas de negocio (ver docs/SCHEMA.md y la tarea):
 * - No se borra, se desactiva.
 * - Desactivar con productos activos es directo, sin aviso: se sacó el
 *   paso de confirmación (mismo criterio que zonas) porque el <select> de
 *   Estado, al ser controlado, no sobrevive el reset nativo que React
 *   aplica al <form> en cada envío — con dos botones de submit visibles
 *   (Guardar / Confirmar) el segundo click terminaba mandando el valor que
 *   el navegador ya había reseteado, no el elegido.
 * - El sector elegido tiene que existir y ser de este comercio, pero no
 *   hace falta que esté activo: el <select> del form incluye también el
 *   sector actual de la categoría aunque ya no esté activo, para no
 *   forzar un cambio de sector solo por editar el nombre.
 */
export async function actualizarCategoria(
  _estadoPrevio: EstadoEditarCategoria,
  formData: FormData,
): Promise<EstadoEditarCategoria> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const sectorId = String(formData.get("sector_id") ?? "");
  const activoTexto = String(formData.get("activo") ?? "");

  if (!id) {
    return { error: "Falta la categoría a editar." };
  }

  const valores = { nombre, sectorId, activo: activoTexto };

  const errorNombre = validarNombreCategoria(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  if (!sectorId) {
    return { error: "Elegí un sector.", campo: "sector_id", valores };
  }

  if (activoTexto !== "true" && activoTexto !== "false") {
    return { error: "Elegí un estado válido.", campo: "activo", valores };
  }

  const activo = activoTexto === "true";

  // Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: categoriaActual, error: errorCategoriaActual } = await supabase
    .from("categorias")
    .select("id")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorCategoriaActual || !categoriaActual) {
    return { error: "No se encontró la categoría.", valores };
  }

  // El sector tiene que existir y ser de este comercio (no se exige que
  // esté activo: ver comentario arriba).
  const { data: sector, error: errorSector } = await supabase
    .from("sectores")
    .select("id")
    .eq("id", sectorId)
    .eq("comercio_id", contexto.comercio.id)
    .maybeSingle();

  if (errorSector) {
    return { error: "No se pudo validar el sector. Probá de nuevo.", valores };
  }
  if (!sector) {
    return { error: "Elegí un sector válido.", campo: "sector_id", valores };
  }

  // Nombres duplicados: sin distinguir mayúsculas, en memoria, contra otras
  // categorías activas (no contra sí misma ni contra inactivas).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("categorias")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .neq("id", id);

  if (errorExistentes) {
    return { error: "No se pudo validar el nombre. Probá de nuevo.", valores };
  }

  const yaExiste = existentes.some(
    (categoria) =>
      categoria.nombre.trim().toLowerCase() === nombre.toLowerCase(),
  );
  if (yaExiste) {
    return {
      error: "Ya hay una categoría activa con ese nombre.",
      campo: "nombre",
      valores,
    };
  }

  // RLS: `categorias_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorActualizar } = await supabase
    .from("categorias")
    .update({ nombre, sector_id: sectorId, activo })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (errorActualizar) {
    return { error: "No se pudo guardar la categoría. Probá de nuevo.", valores };
  }

  revalidatePath("/app/carta/categorias");
  redirect("/app/carta/categorias");
}
