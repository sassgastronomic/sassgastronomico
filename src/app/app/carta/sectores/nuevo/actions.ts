"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { validarNombreSector } from "@/lib/sectores/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoNuevoSector = "nombre";

export type EstadoNuevoSector = {
  error?: string;
  campo?: CampoNuevoSector;
  valores?: { nombre: string };
};

export async function crearSector(
  _estadoPrevio: EstadoNuevoSector,
  formData: FormData,
): Promise<EstadoNuevoSector> {
  const nombre = String(formData.get("nombre") ?? "").trim();

  const valores = { nombre };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  const errorNombre = validarNombreSector(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

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

  // Nombres duplicados: sin distinguir mayúsculas, solo contra sectores
  // activos (uno inactivo con el mismo nombre no cuenta como duplicado).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("sectores")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true);

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

  // El orden no lo maneja el dueño: se calcula solo (el último + 1). El
  // reordenamiento manual llega más adelante con botones subir/bajar, no
  // con este número.
  const { data: ultimo } = await supabase
    .from("sectores")
    .select("orden")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orden = (ultimo?.orden ?? -1) + 1;

  // RLS: `sectores_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorInsertar } = await supabase.from("sectores").insert({
    comercio_id: contexto.comercio.id,
    nombre,
    orden,
  });

  if (errorInsertar) {
    return { error: "No se pudo crear el sector. Probá de nuevo.", valores };
  }

  revalidatePath("/app/carta/sectores");
  redirect("/app/carta/sectores");
}
