"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { validarNombreZona } from "@/lib/zonas/validacion";

export type CampoNuevaZona = "nombre";

export type EstadoNuevaZona = {
  error?: string;
  campo?: CampoNuevaZona;
  valores?: { nombre: string };
};

export async function crearZona(
  _estadoPrevio: EstadoNuevaZona,
  formData: FormData,
): Promise<EstadoNuevaZona> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const valores = { nombre };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  const errorNombre = validarNombreZona(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

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

  // Nombres duplicados: sin distinguir mayúsculas, en memoria, solo contra
  // zonas activas (una inactiva con el mismo nombre no cuenta como
  // duplicado).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("zonas")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true);

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

  // El orden no lo maneja el dueño: se calcula solo (el último + 1).
  const { data: ultimo } = await supabase
    .from("zonas")
    .select("orden")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orden = (ultimo?.orden ?? -1) + 1;

  // RLS: `zonas_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorInsertar } = await supabase.from("zonas").insert({
    comercio_id: contexto.comercio.id,
    nombre,
    orden,
  });

  if (errorInsertar) {
    return { error: "No se pudo crear la zona. Probá de nuevo.", valores };
  }

  revalidatePath("/app/mesas/zonas");
  redirect("/app/mesas/zonas");
}
