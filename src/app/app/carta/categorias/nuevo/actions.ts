"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validarNombreCategoria } from "@/lib/categorias/validacion";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoNuevaCategoria = "nombre" | "sector_id";

export type EstadoNuevaCategoria = {
  error?: string;
  campo?: CampoNuevaCategoria;
  valores?: { nombre: string; sectorId: string };
};

export async function crearCategoria(
  _estadoPrevio: EstadoNuevaCategoria,
  formData: FormData,
): Promise<EstadoNuevaCategoria> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const sectorId = String(formData.get("sector_id") ?? "");

  const valores = { nombre, sectorId };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  const errorNombre = validarNombreCategoria(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  if (!sectorId) {
    return { error: "Elegí un sector.", campo: "sector_id", valores };
  }

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

  // El sector tiene que existir, estar activo y ser de este comercio — no
  // confiar en el <select> del form.
  const { data: sector, error: errorSector } = await supabase
    .from("sectores")
    .select("id")
    .eq("id", sectorId)
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .maybeSingle();

  if (errorSector) {
    return { error: "No se pudo validar el sector. Probá de nuevo.", valores };
  }
  if (!sector) {
    return { error: "Elegí un sector válido.", campo: "sector_id", valores };
  }

  // Nombres duplicados: sin distinguir mayúsculas, en memoria, solo contra
  // categorías activas (mismo criterio que sectores).
  const { data: existentes, error: errorExistentes } = await supabase
    .from("categorias")
    .select("nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true);

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

  // El orden se asigna solo (el último + 1): el dueño no lo maneja a mano.
  const { data: ultima } = await supabase
    .from("categorias")
    .select("orden")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orden = (ultima?.orden ?? -1) + 1;

  // RLS: `categorias_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorInsertar } = await supabase.from("categorias").insert({
    comercio_id: contexto.comercio.id,
    nombre,
    sector_id: sectorId,
    orden,
  });

  if (errorInsertar) {
    return { error: "No se pudo crear la categoría. Probá de nuevo.", valores };
  }

  revalidatePath("/app/carta/categorias");
  redirect("/app/carta/categorias");
}
