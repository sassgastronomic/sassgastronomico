import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { ListadoSalon, type MesaSalon, type ZonaSalon } from "./listado";

const MENSAJE_ERROR: Record<string, string> = {
  mesa_ocupada:
    "Esa mesa ya la abrió otro mozo justo ahora. Se actualizó la pantalla.",
  mesa_no_disponible: "Esa mesa ya no está disponible.",
  no_se_pudo_abrir: "No se pudo abrir la mesa. Probá de nuevo.",
};

/**
 * Zonas activas con sus mesas activas, más — de una consulta aparte a
 * `cuentas` — cuáles están ocupadas ahora mismo y desde cuándo. Tres
 * consultas de tamaño fijo, nada de una por mesa. Mismo criterio que
 * /app/mesas: "solo lo activo de lo activo", pero acá no hace falta
 * mostrar lo inactivo (esto no es una pantalla de administración).
 */
async function obtenerZonasConMesas(comercioId: string): Promise<ZonaSalon[]> {
  const supabase = await crearClienteServidor();

  const { data: zonas } = await supabase
    .from("zonas")
    .select("id, nombre")
    .eq("comercio_id", comercioId)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (!zonas || zonas.length === 0) return [];

  const zonaIds = zonas.map((zona) => zona.id);

  const { data: mesas } = await supabase
    .from("mesas")
    .select("id, nombre, zona_id")
    .eq("comercio_id", comercioId)
    .eq("activo", true)
    .in("zona_id", zonaIds)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const { data: cuentas } = await supabase
    .from("cuentas")
    .select("mesa_id, abierta_en")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta");

  const cuentaPorMesa = new Map(
    (cuentas ?? []).map((cuenta) => [cuenta.mesa_id, cuenta.abierta_en]),
  );

  const mesasPorZona = new Map<string, MesaSalon[]>();
  for (const mesa of mesas ?? []) {
    const abiertaEn = cuentaPorMesa.get(mesa.id);
    const lista = mesasPorZona.get(mesa.zona_id) ?? [];
    lista.push({
      id: mesa.id,
      nombre: mesa.nombre,
      cuenta: abiertaEn ? { abiertaEn } : null,
    });
    mesasPorZona.set(mesa.zona_id, lista);
  }

  return zonas
    .map((zona) => ({
      id: zona.id,
      nombre: zona.nombre,
      mesas: mesasPorZona.get(zona.id) ?? [],
    }))
    .filter((zona) => zona.mesas.length > 0);
}

export default async function PaginaSalon({
  searchParams,
}: PageProps<"/app/salon">) {
  // Autorización propia, sin depender del menú: dueño o mozo, con plan que
  // incluya salón.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mozo") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  const parametros = await searchParams;
  const codigoError =
    typeof parametros.error === "string" ? parametros.error : undefined;
  const mensajeError = codigoError ? MENSAJE_ERROR[codigoError] : undefined;

  const zonas = await obtenerZonasConMesas(contexto.comercio.id);

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-xl font-semibold text-neutral-900">
        Atender mesas
      </h1>

      {mensajeError && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800"
        >
          {mensajeError}
        </p>
      )}

      {zonas.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="text-base text-neutral-500">
            No hay mesas activas para atender todavía.
          </p>
        </div>
      )}

      {zonas.length > 0 && (
        <ListadoSalon
          zonas={zonas}
          comercioId={contexto.comercio.id}
          usuarioId={contexto.usuario.id}
        />
      )}
    </div>
  );
}
