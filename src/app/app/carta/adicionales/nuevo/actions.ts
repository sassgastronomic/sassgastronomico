"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  validarNombreAdicional,
  validarPrecioExtra,
} from "@/lib/adicionales/validacion";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoNuevoAdicional = "nombre" | "precio_extra";

export type EstadoNuevoAdicional = {
  error?: string;
  campo?: CampoNuevoAdicional;
  valores?: { nombre: string; precioExtra: string };
};

export async function crearAdicional(
  _estadoPrevio: EstadoNuevoAdicional,
  formData: FormData,
): Promise<EstadoNuevoAdicional> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precioExtraTexto = String(formData.get("precio_extra") ?? "");

  const valores = { nombre, precioExtra: precioExtraTexto };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  const errorNombre = validarNombreAdicional(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  const errorPrecio = validarPrecioExtra(precioExtraTexto);
  if (errorPrecio) return { error: errorPrecio, campo: "precio_extra", valores };

  const precioExtra = Number(precioExtraTexto);

  // Autorización: solo dueño, sin depender del menú ni de que la página lo
  // haya chequeado (esta Server Action es su propio endpoint).
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // Nombres duplicados: sin distinguir mayúsculas, en memoria, solo contra
  // adicionales activos (mismo criterio que sectores y categorías).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("adicionales")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true);

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

  // RLS: `adicionales_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorInsertar } = await supabase.from("adicionales").insert({
    comercio_id: contexto.comercio.id,
    nombre,
    precio_extra: precioExtra,
  });

  if (errorInsertar) {
    return { error: "No se pudo crear el adicional. Probá de nuevo.", valores };
  }

  revalidatePath("/app/carta/adicionales");
  redirect("/app/carta/adicionales");
}
