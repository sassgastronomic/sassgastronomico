"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Sube o baja un producto intercambiando su `orden` con el de la fila
 * vecina, pero solo dentro de su misma categoría (el orden es por
 * categoría, no global — ver ./nuevo/actions.ts). Mismo mecanismo que
 * `moverCategoria` en ../categorias/acciones-orden.ts: sin useActionState,
 * pensada para invocarse desde un <form action={moverProducto.bind(null,
 * id, direccion)}> por fila. Si se invoca en un caso inválido, no hace
 * nada — no hay un estado de error que mostrar acá.
 */
export async function moverProducto(
  id: string,
  direccion: "arriba" | "abajo",
  _formData: FormData,
): Promise<void> {
  void _formData;

  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: producto, error: errorProducto } = await supabase
    .from("productos")
    .select("id, categoria_id")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorProducto || !producto) return;

  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, orden, nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("categoria_id", producto.categoria_id)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error || !productos) return;

  const indice = productos.findIndex((p) => p.id === id);
  if (indice === -1) return;

  const indiceVecino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (indiceVecino < 0 || indiceVecino >= productos.length) return;

  const actual = productos[indice];
  const vecino = productos[indiceVecino];

  // RLS: `productos_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorActual } = await supabase
    .from("productos")
    .update({ orden: vecino.orden })
    .eq("id", actual.id)
    .eq("comercio_id", contexto.comercio.id);
  if (errorActual) return;

  const { error: errorVecino } = await supabase
    .from("productos")
    .update({ orden: actual.orden })
    .eq("id", vecino.id)
    .eq("comercio_id", contexto.comercio.id);
  if (errorVecino) return;

  revalidatePath("/app/carta/productos");
}

/**
 * Alterna `sin_stock` sin pasar por la pantalla de edición: es la acción
 * más frecuente del día a día, así que tiene que estar a un clic desde el
 * listado. Mismo mecanismo sin JS que `moverProducto`.
 */
export async function alternarSinStock(
  id: string,
  _formData: FormData,
): Promise<void> {
  void _formData;

  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: producto, error: errorProducto } = await supabase
    .from("productos")
    .select("id, sin_stock")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorProducto || !producto) return;

  const { error } = await supabase
    .from("productos")
    .update({ sin_stock: !producto.sin_stock })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (error) return;

  revalidatePath("/app/carta/productos");
}
