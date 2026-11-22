"use server";

import { refresh } from "next/cache";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

export type ResultadoDisponibilidad = { ok: true } | { ok: false; error: string };

const NO_SE_PUDO = "No se pudo cambiar. Probá de nuevo.";

/**
 * Marca un producto sin stock (`sinStock = true`) o con stock de nuevo.
 * La usan la pantalla de cada sector y la del mostrador
 * (src/components/disponibilidad/); solo cambia `sin_stock`, nunca
 * `activo` ni nada más.
 *
 * Autorización, sin depender de la pantalla: dueño y mostrador, cualquier
 * producto del comercio; rol `sector`, solo los productos de los sectores
 * que tiene asignados (sector efectivo del producto). La función de la
 * base (`cambiar_stock_producto`) vuelve a validar lo mismo adentro: una
 * llamada directa a la API no la esquiva.
 *
 * `refresh()`: la respuesta trae la pantalla ya actualizada, así el
 * interruptor no "vuelve para atrás" un instante entre que termina la
 * acción y llega el aviso de Realtime. Las demás pantallas (otras tablets,
 * el mozo) se enteran por Realtime.
 */
export async function cambiarDisponibilidad(
  productoId: unknown,
  sinStock: unknown,
): Promise<ResultadoDisponibilidad> {
  if (typeof productoId !== "string" || typeof sinStock !== "boolean") {
    return { ok: false, error: NO_SE_PUDO };
  }

  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") return { ok: false, error: NO_SE_PUDO };
  const { rol } = contexto;
  if (rol !== "duenio" && rol !== "mostrador" && rol !== "sector") {
    return { ok: false, error: "Tu usuario no puede cambiar la disponibilidad." };
  }

  const supabase = await crearClienteServidor();

  // El producto tiene que ser de este comercio; y para el rol sector, de
  // uno de sus sectores (el efectivo: el propio o, si no tiene, el de su
  // categoría).
  const { data: producto } = await supabase
    .from("productos")
    .select("id, sector_id, categorias(sector_id)")
    .eq("id", productoId)
    .eq("comercio_id", contexto.comercio.id)
    .maybeSingle();
  if (!producto) return { ok: false, error: NO_SE_PUDO };

  if (rol === "sector") {
    const sector = producto.sector_id ?? producto.categorias?.sector_id;
    if (!contexto.sectoresAsignados.some((asignado) => asignado.id === sector)) {
      return {
        ok: false,
        error: "Ese producto es de un sector que no tenés asignado.",
      };
    }
  }

  const { error } = await supabase.rpc("cambiar_stock_producto", {
    p_producto_id: producto.id,
    p_sin_stock: sinStock,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "P0001" ? error.message : NO_SE_PUDO,
    };
  }

  refresh();
  return { ok: true };
}
