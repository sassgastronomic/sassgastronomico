"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import {
  planPermiteSalon,
  validarDesdeLote,
  validarHastaLote,
  validarNombreMesa,
  validarPrefijoLote,
} from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoNuevaMesa = "nombre" | "zona";

export type EstadoNuevaMesa = {
  error?: string;
  campo?: CampoNuevaMesa;
  valores?: { nombre: string; zonaId: string };
};

export type CampoNuevasMesasLote = "prefijo" | "desde" | "hasta" | "zona";

export type EstadoNuevasMesasLote = {
  error?: string;
  campo?: CampoNuevasMesasLote;
  valores?: { prefijo: string; desde: string; hasta: string; zonaId: string };
};

/**
 * La zona elegida tiene que existir, ser de este comercio y estar activa
 * (no confiar en el <select> del form). La usan las dos altas de esta
 * pantalla.
 */
async function zonaValida(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  comercioId: string,
  zonaId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("zonas")
    .select("id")
    .eq("id", zonaId)
    .eq("comercio_id", comercioId)
    .eq("activo", true)
    .maybeSingle();

  return data !== null;
}

/**
 * Nombres de las mesas activas del comercio, para chequear duplicados en
 * memoria (case-insensitive, sin `ilike`: evita inyección de comodines %/_
 * vía lo que tipeó el dueño) — mismo criterio que el resto del proyecto.
 * La usan las dos altas de esta pantalla.
 */
async function nombresActivos(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  comercioId: string,
): Promise<{ nombres: string[]; error: null } | { nombres: null; error: string }> {
  const { data, error } = await supabase
    .from("mesas")
    .select("nombre")
    .eq("comercio_id", comercioId)
    .eq("activo", true);

  if (error || !data) {
    return {
      nombres: null,
      error: "No se pudo validar el nombre. Probá de nuevo.",
    };
  }
  return { nombres: data.map((mesa) => mesa.nombre), error: null };
}

/**
 * Crea una sola mesa.
 */
export async function crearMesa(
  _estadoPrevio: EstadoNuevaMesa,
  formData: FormData,
): Promise<EstadoNuevaMesa> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const zonaId = String(formData.get("zona_id") ?? "");
  const valores = { nombre, zonaId };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  const errorNombre = validarNombreMesa(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  if (!zonaId) {
    return { error: "Elegí una zona.", campo: "zona", valores };
  }

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

  if (!(await zonaValida(supabase, contexto.comercio.id, zonaId))) {
    return { error: "Elegí una zona válida.", campo: "zona", valores };
  }

  const existentes = await nombresActivos(supabase, contexto.comercio.id);
  if (existentes.error !== null) return { error: existentes.error, valores };

  const yaExiste = existentes.nombres.some(
    (n) => n.trim().toLowerCase() === nombre.toLowerCase(),
  );
  if (yaExiste) {
    return {
      error: "Ya hay una mesa activa con ese nombre.",
      campo: "nombre",
      valores,
    };
  }

  // El orden no lo maneja el dueño: se calcula solo (el último + 1).
  const { data: ultimo } = await supabase
    .from("mesas")
    .select("orden")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orden = (ultimo?.orden ?? -1) + 1;

  // RLS: `mesas_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorInsertar } = await supabase.from("mesas").insert({
    comercio_id: contexto.comercio.id,
    nombre,
    zona_id: zonaId,
    orden,
  });

  if (errorInsertar) {
    return { error: "No se pudo crear la mesa. Probá de nuevo.", valores };
  }

  revalidatePath("/app/mesas");
  redirect("/app/mesas");
}

/**
 * Crea varias mesas numeradas de una vez ("Mesa" + del 1 al 12, etc.). Un
 * local que arranca carga todas juntas, no de a una.
 */
export async function crearMesasEnLote(
  _estadoPrevio: EstadoNuevasMesasLote,
  formData: FormData,
): Promise<EstadoNuevasMesasLote> {
  const prefijo = String(formData.get("prefijo") ?? "").trim();
  const desdeTexto = String(formData.get("desde") ?? "");
  const hastaTexto = String(formData.get("hasta") ?? "");
  const zonaId = String(formData.get("zona_id") ?? "");
  const valores = { prefijo, desde: desdeTexto, hasta: hastaTexto, zonaId };

  const errorPrefijo = validarPrefijoLote(prefijo);
  if (errorPrefijo) return { error: errorPrefijo, campo: "prefijo", valores };

  const errorDesde = validarDesdeLote(desdeTexto);
  if (errorDesde) return { error: errorDesde, campo: "desde", valores };

  const errorHasta = validarHastaLote(desdeTexto, hastaTexto);
  if (errorHasta) return { error: errorHasta, campo: "hasta", valores };

  if (!zonaId) {
    return { error: "Elegí una zona.", campo: "zona", valores };
  }

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

  if (!(await zonaValida(supabase, contexto.comercio.id, zonaId))) {
    return { error: "Elegí una zona válida.", campo: "zona", valores };
  }

  const desde = Number(desdeTexto);
  const hasta = Number(hastaTexto);
  const nombresGenerados: string[] = [];
  for (let numero = desde; numero <= hasta; numero++) {
    nombresGenerados.push(`${prefijo} ${numero}`);
  }

  const existentes = await nombresActivos(supabase, contexto.comercio.id);
  if (existentes.error !== null) return { error: existentes.error, valores };

  const existentesEnMinuscula = new Set(
    existentes.nombres.map((n) => n.trim().toLowerCase()),
  );
  const colision = nombresGenerados.find((n) =>
    existentesEnMinuscula.has(n.toLowerCase()),
  );
  if (colision) {
    return {
      error: `Ya hay una mesa activa llamada "${colision}".`,
      valores,
    };
  }

  const { data: ultimo } = await supabase
    .from("mesas")
    .select("orden")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  let siguienteOrden = (ultimo?.orden ?? -1) + 1;

  // Un solo insert con todas las filas (una sentencia SQL, no N viajes):
  // atómico, todo o nada.
  const { error: errorInsertar } = await supabase.from("mesas").insert(
    nombresGenerados.map((nombre) => ({
      comercio_id: contexto.comercio.id,
      nombre,
      zona_id: zonaId,
      orden: siguienteOrden++,
    })),
  );

  if (errorInsertar) {
    return { error: "No se pudieron crear las mesas. Probá de nuevo.", valores };
  }

  revalidatePath("/app/mesas");
  redirect("/app/mesas");
}
