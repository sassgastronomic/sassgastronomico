import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { ActualizarEnVivo } from "./actualizar-en-vivo";
import { ListadoSalon, type MesaSalon, type ZonaSalon } from "./listado";

const MENSAJE_ERROR: Record<string, string> = {
  mesa_ocupada:
    "Esa mesa ya la abrió otro mozo justo ahora. Se actualizó la pantalla.",
  mesa_no_disponible: "Esa mesa ya no está disponible.",
  no_se_pudo_abrir: "No se pudo abrir la mesa. Probá de nuevo.",
  sin_cuenta: "Esa mesa ya no tiene una cuenta abierta: puede que la hayan cerrado.",
};

/**
 * Zonas activas con sus mesas activas, más — de consultas aparte —
 * cuáles están ocupadas ahora mismo, desde cuándo, y cuántos ítems tienen
 * listos para llevar. Cuatro consultas de tamaño fijo, nada de una por
 * mesa. Mismo criterio que /app/mesas: "solo lo activo de lo activo",
 * pero acá no hace falta mostrar lo inactivo (esto no es una pantalla de
 * administración).
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
    .select("id, mesa_id, abierta_en")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta");

  const cuentaIds = (cuentas ?? []).map((cuenta) => cuenta.id);

  // Ítems listos (cocina ya los terminó) de pedidos confirmados de las
  // cuentas abiertas. Se cuentan unidades, no líneas: "2× Lomito" son dos
  // platos para llevar.
  const { data: listos } =
    cuentaIds.length > 0
      ? await supabase
          .from("pedido_items")
          .select("cantidad, pedidos!inner(cuenta_id, estado)")
          .eq("comercio_id", comercioId)
          .eq("estado", "listo")
          .eq("pedidos.estado", "confirmado")
          .in("pedidos.cuenta_id", cuentaIds)
      : { data: [] };

  const listosPorCuenta = new Map<string, number>();
  for (const item of listos ?? []) {
    const cuentaId = item.pedidos.cuenta_id;
    if (!cuentaId) continue;
    listosPorCuenta.set(
      cuentaId,
      (listosPorCuenta.get(cuentaId) ?? 0) + item.cantidad,
    );
  }

  const cuentaPorMesa = new Map(
    (cuentas ?? []).map((cuenta) => [
      cuenta.mesa_id,
      {
        abiertaEn: cuenta.abierta_en,
        listos: listosPorCuenta.get(cuenta.id) ?? 0,
      },
    ]),
  );

  const mesasPorZona = new Map<string, MesaSalon[]>();
  for (const mesa of mesas ?? []) {
    const lista = mesasPorZona.get(mesa.zona_id) ?? [];
    lista.push({
      id: mesa.id,
      nombre: mesa.nombre,
      cuenta: cuentaPorMesa.get(mesa.id) ?? null,
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

  // Lo primero que mira el mozo al entrar: qué tiene para llevar. Va
  // arriba de las zonas (que pueden estar plegadas) para que nunca quede
  // escondido.
  const mesasConListos = zonas.flatMap((zona) =>
    zona.mesas.filter((mesa) => (mesa.cuenta?.listos ?? 0) > 0),
  );

  return (
    <div className="space-y-6 pb-8">
      <ActualizarEnVivo comercioId={contexto.comercio.id} />

      <h1 className="text-xl font-semibold text-neutral-900">
        Atender mesas
      </h1>

      {mesasConListos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold tracking-wide text-blue-800 uppercase">
            Listo para llevar
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {mesasConListos.map((mesa) => (
              <Link
                key={mesa.id}
                href={`/app/salon/${mesa.id}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-blue-600 px-5 py-4 text-white active:bg-blue-700"
              >
                <span className="text-xl font-bold">{mesa.nombre}</span>
                <span className="text-base font-semibold">
                  {mesa.cuenta?.listos} para llevar →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
