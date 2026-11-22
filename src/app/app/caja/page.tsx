import { redirect } from "next/navigation";

import { formatearJornada } from "@/lib/caja/caja";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteTakeAway } from "@/lib/comercios/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { PantallaCaja } from "./pantalla-caja";

/**
 * Caja: abrir la jornada al llegar y cerrarla al irse, con el resumen de
 * gestión antes de cerrar. Dueño y mostrador, en cualquier plan. Es lo
 * primero que ve el mostrador al loguearse mientras la caja no esté
 * abierta (ver src/app/app/page.tsx).
 *
 * Resumen interno: no es un comprobante ni reemplaza el cierre fiscal.
 */
export default async function PaginaCaja() {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mostrador") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();
  const { data: situacion, error } = await supabase.rpc("situacion_caja", {
    p_comercio_id: contexto.comercio.id,
  });
  if (error || !situacion) {
    throw new Error(`situacion_caja: ${error?.message ?? "sin datos"}`);
  }

  // Con una caja abierta, su resumen (lo que se va a cerrar) y lo que
  // falta para poder cerrarla.
  let resumen = null;
  if (situacion.abierta) {
    const { data, error: errorResumen } = await supabase.rpc("resumen_caja", {
      p_caja_id: situacion.abierta.id,
    });
    if (errorResumen || !data) {
      throw new Error(`resumen_caja: ${errorResumen?.message ?? "sin datos"}`);
    }
    resumen = data;
  }

  return (
    <PantallaCaja
      comercioId={contexto.comercio.id}
      jornadaHoy={formatearJornada(situacion.jornada_actual)}
      cerradaHoy={situacion.cerrada_hoy}
      abierta={
        situacion.abierta
          ? {
              id: situacion.abierta.id,
              jornada: formatearJornada(situacion.abierta.jornada),
              esDeHoy: situacion.abierta.jornada === situacion.jornada_actual,
              horaApertura: situacion.abierta.hora_apertura,
              abiertaPor: situacion.abierta.abierta_por,
            }
          : null
      }
      resumen={resumen}
      conPedidosOnline={planPermiteTakeAway(contexto.comercio.plan)}
    />
  );
}
