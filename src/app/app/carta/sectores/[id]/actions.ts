"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { validarNombreSector } from "@/lib/sectores/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoEditarSector = "nombre" | "activo";

export type EstadoEditarSector = {
  error?: string;
  campo?: CampoEditarSector;
  valores?: { nombre: string; activo: string };
  // Aviso "¿estás seguro?" (tiene categorías asignadas) que todavía no
  // bloquea nada — a diferencia de `error`, que sí impide guardar.
  confirmacion?: string;
};

/**
 * Actualiza nombre y activo/inactivo de un sector. El orden no se toca acá:
 * el dueño no lo maneja a mano (se asigna solo al crear, ver
 * ./nuevo/actions.ts); el reordenamiento manual llega más adelante con
 * botones subir/bajar, no con este formulario.
 *
 * Reglas de negocio (ver docs/SCHEMA.md y la tarea):
 * - No se borra, se desactiva.
 * - No se puede desactivar el último sector activo del comercio.
 * - Si tiene categorías activas asignadas, se avisa cuántas antes de
 *   desactivar (no bloquea: el admin puede confirmar igual). La
 *   confirmación viaja como un segundo botón de submit con
 *   `name="confirmar" value="true"` — no con un input oculto controlado
 *   por estado, para no depender de que React re-renderice antes de que
 *   el navegador junte los datos del formulario.
 */
export async function actualizarSector(
  _estadoPrevio: EstadoEditarSector,
  formData: FormData,
): Promise<EstadoEditarSector> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const activoTexto = String(formData.get("activo") ?? "");
  const confirmar = formData.get("confirmar") === "true";

  if (!id) {
    return { error: "Falta el sector a editar." };
  }

  const valores = { nombre, activo: activoTexto };

  const errorNombre = validarNombreSector(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

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

  const { data: sectorActual, error: errorSectorActual } = await supabase
    .from("sectores")
    .select("id, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorSectorActual || !sectorActual) {
    return { error: "No se encontró el sector.", valores };
  }

  // Nombres duplicados: sin distinguir mayúsculas, contra otros sectores
  // activos (no contra sí mismo ni contra sectores ya inactivos).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("sectores")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .neq("id", id);

  if (errorExistentes) {
    return { error: "No se pudo validar el nombre. Probá de nuevo.", valores };
  }

  const yaExiste = existentes.some(
    (sector) => sector.nombre.trim().toLowerCase() === nombre.toLowerCase(),
  );
  if (yaExiste) {
    return {
      error: "Ya hay un sector activo con ese nombre.",
      campo: "nombre",
      valores,
    };
  }

  const seDesactiva = sectorActual.activo && !activo;

  if (seDesactiva) {
    // No permitir desactivar el último sector activo del comercio.
    const { data: otrosActivos, error: errorOtrosActivos } = await supabase
      .from("sectores")
      .select("id")
      .eq("comercio_id", contexto.comercio.id)
      .eq("activo", true)
      .neq("id", id);

    if (errorOtrosActivos) {
      return { error: "No se pudo validar. Probá de nuevo.", campo: "activo", valores };
    }

    if (otrosActivos.length === 0) {
      return {
        error: "No podés desactivar el último sector activo del comercio.",
        campo: "activo",
        valores,
      };
    }

    // Avisar si tiene categorías activas asignadas — sin bloquear, salvo
    // que ya se haya confirmado.
    if (!confirmar) {
      const { data: categorias, error: errorCategorias } = await supabase
        .from("categorias")
        .select("id")
        .eq("sector_id", id)
        .eq("comercio_id", contexto.comercio.id)
        .eq("activo", true);

      if (errorCategorias) {
        return { error: "No se pudo validar. Probá de nuevo.", campo: "activo", valores };
      }

      const cantidad = categorias.length;
      if (cantidad > 0) {
        const plural = cantidad === 1 ? "" : "s";
        return {
          valores,
          confirmacion:
            `Este sector tiene ${cantidad} categoría${plural} asignada${plural}. ` +
            `Sus productos van a quedar sin un sector visible hasta que los reasignes. ` +
            `¿Desactivar igual?`,
        };
      }
    }
  }

  // RLS: `sectores_duenio` exige `tiene_rol(comercio_id, '{duenio}')`. Sin
  // `orden`: no se toca, se mantiene el que ya tenía.
  const { error: errorActualizar } = await supabase
    .from("sectores")
    .update({ nombre, activo })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (errorActualizar) {
    return { error: "No se pudo guardar el sector. Probá de nuevo.", valores };
  }

  revalidatePath("/app/carta/sectores");
  redirect("/app/carta/sectores");
}
