import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { ListadoMesas, type MesaListado, type ZonaConMesas } from "./listado";

type ResultadoMesas =
  | { zonas: ZonaConMesas[]; error: null }
  | { zonas: null; error: string };

/**
 * Zonas del comercio (todas, no solo las activas: una zona desactivada con
 * mesas igual tiene que poder verse) más sus mesas agrupadas, más — de una
 * consulta aparte a `cuentas` — cuáles tienen una cuenta abierta ahora
 * mismo. Tres consultas de tamaño fijo, nada de una por fila ni por zona.
 */
async function obtenerMesasPorZona(comercioId: string): Promise<ResultadoMesas> {
  const supabase = await crearClienteServidor();

  const { data: zonas, error: errorZonas } = await supabase
    .from("zonas")
    .select("id, nombre, activo")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorZonas || !zonas) {
    return {
      zonas: null,
      error: "No se pudieron cargar las mesas. Probá de nuevo en un momento.",
    };
  }

  const { data: mesas, error: errorMesas } = await supabase
    .from("mesas")
    .select("id, nombre, activo, zona_id")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorMesas || !mesas) {
    return {
      zonas: null,
      error: "No se pudieron cargar las mesas. Probá de nuevo en un momento.",
    };
  }

  const { data: cuentasAbiertas, error: errorCuentas } = await supabase
    .from("cuentas")
    .select("mesa_id")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta");

  if (errorCuentas) {
    return {
      zonas: null,
      error: "No se pudieron cargar las mesas. Probá de nuevo en un momento.",
    };
  }

  const mesasConCuentaAbierta = new Set(
    (cuentasAbiertas ?? []).map((cuenta) => cuenta.mesa_id),
  );

  const mesasPorZona = new Map<string, MesaListado[]>();
  for (const mesa of mesas) {
    const lista = mesasPorZona.get(mesa.zona_id) ?? [];
    lista.push({
      id: mesa.id,
      nombre: mesa.nombre,
      activo: mesa.activo,
      tieneCuentaAbierta: mesasConCuentaAbierta.has(mesa.id),
    });
    mesasPorZona.set(mesa.zona_id, lista);
  }

  return {
    zonas: zonas.map((zona) => ({
      id: zona.id,
      nombre: zona.nombre,
      activo: zona.activo,
      mesas: mesasPorZona.get(zona.id) ?? [],
    })),
    error: null,
  };
}

export default async function PaginaMesas({
  searchParams,
}: PageProps<"/app/mesas">) {
  // Autorización propia, sin depender del menú: solo dueño, y solo si el
  // plan incluye salón.
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

  const parametros = await searchParams;
  const zonaInactiva = parametros.zona_inactiva === "1";

  const resultado = await obtenerMesasPorZona(contexto.comercio.id);

  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Mesas</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { zonas } = resultado;
  const hayAlgunaMesa = zonas.some((zona) => zona.mesas.length > 0);
  // Zona inactiva y sin mesas: no aporta nada mostrarla.
  const zonasVisibles = zonas.filter(
    (zona) => zona.activo || zona.mesas.length > 0,
  );

  return (
    <div className="space-y-6">
      {zonaInactiva && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esa mesa pertenece a una zona inactiva: activá la zona para poder
          editarla.
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-neutral-900">Mesas</h1>
        <div className="flex gap-2">
          <Link
            href="/app/mesas/zonas"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Zonas
          </Link>
          <Link
            href="/app/mesas/nuevo"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear mesas
          </Link>
        </div>
      </div>

      {zonas.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay zonas cargadas. Creá una para poder cargar mesas.
          </p>
          <Link
            href="/app/mesas/zonas/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear zona
          </Link>
        </div>
      )}

      {zonas.length > 0 && !hayAlgunaMesa && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Todavía no hay mesas cargadas.
          </p>
          <Link
            href="/app/mesas/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear mesas
          </Link>
        </div>
      )}

      {zonasVisibles.length > 0 && <ListadoMesas zonas={zonasVisibles} />}
    </div>
  );
}
