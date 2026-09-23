"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon, validarNombreMesa } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoEditarMesa = "nombre" | "zona" | "activo";

export type EstadoEditarMesa = {
  error?: string;
  campo?: CampoEditarMesa;
  valores?: { nombre: string; zonaId: string; activo: string };
};

/**
 * Actualiza nombre y activo/inactivo de una mesa. El orden no se toca acá
 * (no hay reordenamiento manual todavía, ver docs/ARQUITECTURA.md).
 *
 * Regla de negocio: no se puede desactivar una mesa con una cuenta abierta
 * — bloqueo directo, no un aviso para confirmar como en sectores/categorías/
 * adicionales: el mozo perdería acceso a un pedido en curso.
 */
export async function actualizarMesa(
  _estadoPrevio: EstadoEditarMesa,
  formData: FormData,
): Promise<EstadoEditarMesa> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const zonaId = String(formData.get("zona_id") ?? "");
  const activoTexto = String(formData.get("activo") ?? "");

  if (!id) {
    return { error: "Falta la mesa a editar." };
  }

  const valores = { nombre, zonaId, activo: activoTexto };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  const errorNombre = validarNombreMesa(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  if (!zonaId) {
    return { error: "Elegí una zona.", campo: "zona", valores };
  }

  if (activoTexto !== "true" && activoTexto !== "false") {
    return { error: "Elegí un estado válido.", campo: "activo", valores };
  }
  const activo = activoTexto === "true";

  // Autorización: solo dueño, y solo si el plan incluye salón, sin depender
  // del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: mesaActual, error: errorMesaActual } = await supabase
    .from("mesas")
    .select("id, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorMesaActual || !mesaActual) {
    return { error: "No se encontró la mesa.", valores };
  }

  // La zona tiene que existir y ser de este comercio (no hace falta que
  // esté activa: no se fuerza un cambio de zona solo por editar otra cosa,
  // mismo criterio que la categoría de un producto en /app/carta).
  const { data: zona, error: errorZona } = await supabase
    .from("zonas")
    .select("id")
    .eq("id", zonaId)
    .eq("comercio_id", contexto.comercio.id)
    .maybeSingle();

  if (errorZona) {
    return { error: "No se pudo validar la zona. Probá de nuevo.", valores };
  }
  if (!zona) {
    return { error: "Elegí una zona válida.", campo: "zona", valores };
  }

  // Nombres duplicados: sin distinguir mayúsculas, en memoria, contra otras
  // mesas activas (no contra sí misma ni contra inactivas).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("mesas")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .neq("id", id);

  if (errorExistentes) {
    return { error: "No se pudo validar el nombre. Probá de nuevo.", valores };
  }

  const yaExiste = existentes.some(
    (mesa) => mesa.nombre.trim().toLowerCase() === nombre.toLowerCase(),
  );
  if (yaExiste) {
    return {
      error: "Ya hay una mesa activa con ese nombre.",
      campo: "nombre",
      valores,
    };
  }

  const seDesactiva = mesaActual.activo && !activo;

  if (seDesactiva) {
    const { data: cuentaAbierta, error: errorCuenta } = await supabase
      .from("cuentas")
      .select("id")
      .eq("mesa_id", id)
      .eq("comercio_id", contexto.comercio.id)
      .eq("estado", "abierta")
      .maybeSingle();

    if (errorCuenta) {
      return {
        error: "No se pudo validar. Probá de nuevo.",
        campo: "activo",
        valores,
      };
    }
    if (cuentaAbierta) {
      return {
        error: "No se puede desactivar: tiene una cuenta abierta.",
        campo: "activo",
        valores,
      };
    }
  }

  // RLS: `mesas_duenio` exige `tiene_rol(comercio_id, '{duenio}')`. Sin
  // `orden`: no se toca, se mantiene el que ya tenía.
  const { error: errorActualizar } = await supabase
    .from("mesas")
    .update({ nombre, zona_id: zonaId, activo })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (errorActualizar) {
    return { error: "No se pudo guardar la mesa. Probá de nuevo.", valores };
  }

  revalidatePath("/app/mesas");
  redirect("/app/mesas");
}
