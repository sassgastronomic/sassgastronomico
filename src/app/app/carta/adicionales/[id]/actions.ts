"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  validarNombreAdicional,
  validarPrecioExtra,
} from "@/lib/adicionales/validacion";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoEditarAdicional = "nombre" | "precio_extra" | "activo";

export type EstadoEditarAdicional = {
  error?: string;
  campo?: CampoEditarAdicional;
  valores?: {
    nombre: string;
    precioExtra: string;
    activo: string;
    // Los productos tildados también viajan acá: si no, se pierden en
    // cualquier vuelta con error (o con la confirmación de desactivar),
    // igual que pasaría con cualquier otro campo no controlado.
    productosAsignados: string[];
  };
  // Aviso "¿estás seguro?" (asignado a productos) que todavía no bloquea
  // nada — a diferencia de `error`, que sí impide guardar.
  confirmacion?: string;
};

/**
 * Actualiza nombre, precio extra y activo/inactivo de un adicional, y de
 * paso guarda a qué productos está asignado (checkboxes agrupados por
 * categoría en el formulario) — un solo botón de guardar para todo lo que
 * se ve en la pantalla.
 *
 * Reglas de negocio (ver docs/SCHEMA.md y la tarea):
 * - No se borra, se desactiva.
 * - Si está asignado a productos activos, se avisa cuántos antes de
 *   desactivar (no bloquea: se puede confirmar igual). Mismo mecanismo que
 *   sectores/categorías: un segundo botón de submit con
 *   `name="confirmar" value="true"`, no un input oculto controlado por
 *   estado.
 * - Nombres duplicados: sin distinguir mayúsculas, en memoria, solo contra
 *   otros adicionales activos.
 */
export async function actualizarAdicional(
  _estadoPrevio: EstadoEditarAdicional,
  formData: FormData,
): Promise<EstadoEditarAdicional> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precioExtraTexto = String(formData.get("precio_extra") ?? "");
  const activoTexto = String(formData.get("activo") ?? "");
  const confirmar = formData.get("confirmar") === "true";
  const productosSeleccionados = formData.getAll("producto_id").map(String);

  if (!id) {
    return { error: "Falta el adicional a editar." };
  }

  const valores = {
    nombre,
    precioExtra: precioExtraTexto,
    activo: activoTexto,
    productosAsignados: productosSeleccionados,
  };

  const errorNombre = validarNombreAdicional(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  const errorPrecio = validarPrecioExtra(precioExtraTexto);
  if (errorPrecio) {
    return { error: errorPrecio, campo: "precio_extra", valores };
  }

  if (activoTexto !== "true" && activoTexto !== "false") {
    return { error: "Elegí un estado válido.", campo: "activo", valores };
  }

  const precioExtra = Number(precioExtraTexto);
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

  const { data: adicionalActual, error: errorAdicionalActual } = await supabase
    .from("adicionales")
    .select("id, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorAdicionalActual || !adicionalActual) {
    return { error: "No se encontró el adicional.", valores };
  }

  // Nombres duplicados: sin distinguir mayúsculas, contra otros
  // adicionales activos (no contra sí mismo ni contra inactivos).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("adicionales")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .neq("id", id);

  if (errorExistentes) {
    return { error: "No se pudo validar el nombre. Probá de nuevo.", valores };
  }

  const yaExiste = existentes.some(
    (adicional) =>
      adicional.nombre.trim().toLowerCase() === nombre.toLowerCase(),
  );
  if (yaExiste) {
    return {
      error: "Ya hay un adicional activo con ese nombre.",
      campo: "nombre",
      valores,
    };
  }

  const seDesactiva = adicionalActual.activo && !activo;

  if (seDesactiva && !confirmar) {
    const { data: asignados, error: errorAsignados } = await supabase
      .from("producto_adicionales")
      .select("producto_id, productos(activo)")
      .eq("adicional_id", id)
      .eq("comercio_id", contexto.comercio.id);

    if (errorAsignados) {
      return { error: "No se pudo validar. Probá de nuevo.", campo: "activo", valores };
    }

    const cantidad = asignados.filter((a) => a.productos?.activo).length;
    if (cantidad > 0) {
      const plural = cantidad === 1 ? "" : "s";
      return {
        valores,
        confirmacion:
          `Este adicional está asignado a ${cantidad} producto${plural} activo${plural}. ` +
          `Van a dejar de ofrecerlo hasta que lo reactives. ` +
          `¿Desactivar igual?`,
      };
    }
  }

  // RLS: `adicionales_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorActualizar } = await supabase
    .from("adicionales")
    .update({ nombre, precio_extra: precioExtra, activo })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (errorActualizar) {
    return { error: "No se pudo guardar el adicional. Probá de nuevo.", valores };
  }

  // Asignación a productos: valida contra productos activos reales del
  // comercio (no confía en los checkboxes del form) y aplica la
  // diferencia contra lo que ya había en producto_adicionales.
  const { data: productosValidos } = await supabase
    .from("productos")
    .select("id")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .in("id", productosSeleccionados.length > 0 ? productosSeleccionados : [""]);

  const idsValidos = new Set((productosValidos ?? []).map((p) => p.id));

  const { data: actuales } = await supabase
    .from("producto_adicionales")
    .select("producto_id")
    .eq("adicional_id", id)
    .eq("comercio_id", contexto.comercio.id);

  const idsActuales = new Set((actuales ?? []).map((p) => p.producto_id));

  const aInsertar = [...idsValidos].filter((pid) => !idsActuales.has(pid));
  const aBorrar = [...idsActuales].filter((pid) => !idsValidos.has(pid));

  if (aInsertar.length > 0) {
    const { error: errorInsertar } = await supabase
      .from("producto_adicionales")
      .insert(
        aInsertar.map((productoId) => ({
          comercio_id: contexto.comercio.id,
          producto_id: productoId,
          adicional_id: id,
        })),
      );
    if (errorInsertar) {
      console.error(
        `[actualizarAdicional] no se pudieron asignar productos al adicional ${id}: ${errorInsertar.message}`,
      );
    }
  }

  if (aBorrar.length > 0) {
    const { error: errorBorrar } = await supabase
      .from("producto_adicionales")
      .delete()
      .eq("adicional_id", id)
      .eq("comercio_id", contexto.comercio.id)
      .in("producto_id", aBorrar);
    if (errorBorrar) {
      console.error(
        `[actualizarAdicional] no se pudieron desasignar productos del adicional ${id}: ${errorBorrar.message}`,
      );
    }
  }

  revalidatePath("/app/carta/adicionales");
  revalidatePath("/app/carta/productos");
  redirect("/app/carta/adicionales");
}
