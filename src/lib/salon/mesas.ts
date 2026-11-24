import "server-only";

import { crearClienteServidor } from "@/lib/supabase/server";

export type MesaConCuenta = {
  id: string;
  nombre: string;
  /** La cuenta abierta de la mesa, si tiene una. */
  cuenta: { id: string; abiertaEn: string } | null;
};

export type ZonaConMesas = {
  id: string;
  nombre: string;
  mesas: MesaConCuenta[];
};

/**
 * Zonas activas con sus mesas activas, marcando cuáles tienen cuenta
 * abierta y desde cuándo. Tres consultas de tamaño fijo, nada de una por
 * mesa.
 *
 * "Solo lo activo de lo activo": mismo criterio que /app/mesas, pero acá
 * no hace falta mostrar lo inactivo (ninguna de las dos pantallas que usan
 * esto es de administración). Las zonas que quedan sin mesas no se
 * devuelven: un encabezado vacío no le dice nada a nadie.
 *
 * La usan /app/salon (que le suma cuántos ítems tiene listos cada cuenta)
 * y /app/qr/[codigo] (que la usa para elegir en qué mesa entra el pedido
 * del cliente).
 */
export async function obtenerZonasConMesas(
  comercioId: string,
): Promise<ZonaConMesas[]> {
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

  const cuentaPorMesa = new Map(
    (cuentas ?? []).map((cuenta) => [
      cuenta.mesa_id,
      { id: cuenta.id, abiertaEn: cuenta.abierta_en },
    ]),
  );

  const mesasPorZona = new Map<string, MesaConCuenta[]>();
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
