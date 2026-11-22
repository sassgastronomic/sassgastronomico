import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * La caja abierta del comercio, si hay. La puede leer cualquier miembro
 * (RLS `cajas_leer`): el mozo la usa para saber si puede abrir mesas. Que
 * esté abierta es lo que hace que el local opere — sin ella la base
 * rechaza pedidos y mesas nuevas (ver supabase/migrations/…_caja_y_jornadas.sql),
 * así que esto es para mostrar el aviso, no para impedir nada.
 */
export async function obtenerCajaAbierta(
  comercioId: string,
): Promise<{ id: string; jornada: string } | null> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cajas")
    .select("id, jornada")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta")
    .maybeSingle();
  return data;
}

// La jornada es una fecha sin hora ("2026-10-14"): se formatea en UTC
// para que no se corra un día por la zona horaria del servidor.
const formateadorJornada = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

// "mar 14/10"
export function formatearJornada(jornada: string): string {
  return formateadorJornada
    .format(new Date(`${jornada}T12:00:00Z`))
    .replace(",", "");
}
