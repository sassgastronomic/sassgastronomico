"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { validarNombreZona } from "@/lib/zonas/validacion";

export type CampoEditarZona = "nombre" | "activo";

export type EstadoEditarZona = {
  error?: string;
  campo?: CampoEditarZona;
  valores?: { nombre: string; activo: string };
};

/**
 * Actualiza nombre y activo/inactivo de una zona. El orden no se toca acá
 * (sin reordenamiento manual todavía, igual que sectores).
 *
 * Reglas de negocio:
 * - No se borra, se desactiva.
 * - No se puede desactivar la última zona activa del comercio.
 * - No se puede desactivar si alguna mesa de la zona tiene una cuenta
 *   abierta ahora mismo (mismo criterio que mesas/[id]/actions.ts). Fuera
 *   de eso, desactivar es directo: las mesas siguen existiendo, agrupadas
 *   bajo una zona inactiva.
 */
export async function actualizarZona(
  _estadoPrevio: EstadoEditarZona,
  formData: FormData,
): Promise<EstadoEditarZona> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const activoTexto = String(formData.get("activo") ?? "");

  if (!id) {
    return { error: "Falta la zona a editar." };
  }

  const valores = { nombre, activo: activoTexto };

  const errorNombre = validarNombreZona(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

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

  const { data: zonaActual, error: errorZonaActual } = await supabase
    .from("zonas")
    .select("id, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorZonaActual || !zonaActual) {
    return { error: "No se encontró la zona.", valores };
  }

  // Nombres duplicados: sin distinguir mayúsculas, contra otras zonas
  // activas (no contra sí misma ni contra zonas ya inactivas).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("zonas")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .neq("id", id);

  if (errorExistentes) {
    return { error: "No se pudo validar el nombre. Probá de nuevo.", valores };
  }

  const yaExiste = existentes.some(
    (zona) => zona.nombre.trim().toLowerCase() === nombre.toLowerCase(),
  );
  if (yaExiste) {
    return {
      error: "Ya hay una zona activa con ese nombre.",
      campo: "nombre",
      valores,
    };
  }

  const seDesactiva = zonaActual.activo && !activo;

  if (seDesactiva) {
    // No permitir desactivar la última zona activa del comercio.
    const { data: otrasActivas, error: errorOtrasActivas } = await supabase
      .from("zonas")
      .select("id")
      .eq("comercio_id", contexto.comercio.id)
      .eq("activo", true)
      .neq("id", id);

    if (errorOtrasActivas) {
      return {
        error: "No se pudo validar. Probá de nuevo.",
        campo: "activo",
        valores,
      };
    }

    if (otrasActivas.length === 0) {
      return {
        error: "No podés desactivar la última zona activa del comercio.",
        campo: "activo",
        valores,
      };
    }

    // No se puede desactivar si alguna mesa de la zona tiene una cuenta
    // abierta ahora mismo — mismo criterio que mesas/[id]/actions.ts.
    const { data: mesasZona, error: errorMesasZona } = await supabase
      .from("mesas")
      .select("id")
      .eq("zona_id", id)
      .eq("comercio_id", contexto.comercio.id);

    if (errorMesasZona) {
      return {
        error: "No se pudo validar. Probá de nuevo.",
        campo: "activo",
        valores,
      };
    }

    const idsMesas = mesasZona.map((mesa) => mesa.id);
    if (idsMesas.length > 0) {
      const { data: cuentaAbierta, error: errorCuenta } = await supabase
        .from("cuentas")
        .select("id")
        .in("mesa_id", idsMesas)
        .eq("comercio_id", contexto.comercio.id)
        .eq("estado", "abierta")
        .limit(1)
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
          error:
            "No se puede desactivar: una mesa de esta zona tiene una cuenta abierta.",
          campo: "activo",
          valores,
        };
      }
    }
  }

  // `actualizar_zona_con_mesas` hace, en una sola transacción: el update de
  // la zona y —si `activo` cambió— el mismo cambio arrastrado a todas sus
  // mesas (ver supabase/migrations/). Sin `orden`: no se toca, se mantiene
  // el que ya tenía.
  const { error: errorActualizar } = await supabase.rpc(
    "actualizar_zona_con_mesas",
    { p_id: id, p_nombre: nombre, p_activo: activo },
  );

  if (errorActualizar) {
    return { error: "No se pudo guardar la zona. Probá de nuevo.", valores };
  }

  revalidatePath("/app/mesas/zonas");
  revalidatePath("/app/mesas");
  redirect("/app/mesas/zonas");
}
