"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { validarNombreProducto, validarPrecio } from "@/lib/productos/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoEditarProducto = "categoria_id" | "nombre" | "precio" | "activo";

export type EstadoEditarProducto = {
  error?: string;
  campo?: CampoEditarProducto;
  valores?: {
    categoriaId: string;
    nombre: string;
    descripcion: string;
    precio: string;
    activo: string;
    // Los adicionales tildados también viajan acá: si no, se pierden en
    // cualquier vuelta con error, igual que pasaría con cualquier otro
    // campo no controlado.
    adicionalesAsignados: string[];
  };
};

/**
 * Actualiza categoría, nombre, descripción, precio y activo/inactivo de un
 * producto, y de paso guarda qué adicionales ofrece (checkboxes en el
 * formulario) — un solo botón de guardar para todo lo que se ve en la
 * pantalla. El orden no se toca a mano: si la categoría cambia, el
 * producto pasa al final de la nueva (ver más abajo); si no cambia,
 * mantiene el que ya tenía. El reordenamiento manual dentro de una
 * categoría se hace desde el listado (../acciones-listado.ts), y "sin
 * stock" tiene su propio botón ahí también — este form no lo toca.
 *
 * `sector_id` siempre queda en null: un producto se prepara en el sector
 * de su categoría, no hay forma de pisarlo desde acá (ver
 * docs/SCHEMA.md). Si el producto ya tenía uno propio cargado de antes,
 * se limpia al guardar.
 */
export async function actualizarProducto(
  _estadoPrevio: EstadoEditarProducto,
  formData: FormData,
): Promise<EstadoEditarProducto> {
  const id = String(formData.get("id") ?? "");
  const categoriaId = String(formData.get("categoria_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const precioTexto = String(formData.get("precio") ?? "");
  const activoTexto = String(formData.get("activo") ?? "");
  const adicionalesSeleccionados = formData.getAll("adicional_id").map(String);

  if (!id) {
    return { error: "Falta el producto a editar." };
  }

  const valores = {
    categoriaId,
    nombre,
    descripcion,
    precio: precioTexto,
    activo: activoTexto,
    adicionalesAsignados: adicionalesSeleccionados,
  };

  if (!categoriaId) {
    return { error: "Elegí una categoría.", campo: "categoria_id", valores };
  }

  const errorNombre = validarNombreProducto(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  const errorPrecio = validarPrecio(precioTexto);
  if (errorPrecio) return { error: errorPrecio, campo: "precio", valores };

  if (activoTexto !== "true" && activoTexto !== "false") {
    return { error: "Elegí un estado válido.", campo: "activo", valores };
  }

  const precio = Number(precioTexto);
  const activo = activoTexto === "true";

  // Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: productoActual, error: errorProductoActual } = await supabase
    .from("productos")
    .select("id, categoria_id, orden")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorProductoActual || !productoActual) {
    return { error: "No se encontró el producto.", valores };
  }

  // La categoría tiene que existir y ser de este comercio (no hace falta
  // que esté activa: no se fuerza un cambio de categoría solo por editar
  // otra cosa, mismo criterio que el sector de una categoría).
  const { data: categoria, error: errorCategoria } = await supabase
    .from("categorias")
    .select("id")
    .eq("id", categoriaId)
    .eq("comercio_id", contexto.comercio.id)
    .maybeSingle();

  if (errorCategoria) {
    return { error: "No se pudo validar la categoría. Probá de nuevo.", valores };
  }
  if (!categoria) {
    return { error: "Elegí una categoría válida.", campo: "categoria_id", valores };
  }

  // Si cambia de categoría, va al final de la nueva; si no, mantiene el
  // orden que ya tenía.
  let orden = productoActual.orden;
  if (categoriaId !== productoActual.categoria_id) {
    const { data: ultimo } = await supabase
      .from("productos")
      .select("orden")
      .eq("comercio_id", contexto.comercio.id)
      .eq("categoria_id", categoriaId)
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle();
    orden = (ultimo?.orden ?? -1) + 1;
  }

  // RLS: `productos_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  const { error: errorActualizar } = await supabase
    .from("productos")
    .update({
      categoria_id: categoriaId,
      nombre,
      descripcion: descripcion || null,
      precio,
      sector_id: null,
      activo,
      orden,
    })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (errorActualizar) {
    return { error: "No se pudo guardar el producto. Probá de nuevo.", valores };
  }

  // Adicionales que ofrece: valida contra adicionales activos reales del
  // comercio (no confía en los checkboxes del form) y aplica la
  // diferencia contra lo que ya había en producto_adicionales.
  const { data: adicionalesValidos } = await supabase
    .from("adicionales")
    .select("id")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .in(
      "id",
      adicionalesSeleccionados.length > 0 ? adicionalesSeleccionados : [""],
    );

  const idsValidos = new Set((adicionalesValidos ?? []).map((a) => a.id));

  const { data: actuales } = await supabase
    .from("producto_adicionales")
    .select("adicional_id")
    .eq("producto_id", id)
    .eq("comercio_id", contexto.comercio.id);

  const idsActuales = new Set((actuales ?? []).map((a) => a.adicional_id));

  const aInsertar = [...idsValidos].filter((aid) => !idsActuales.has(aid));
  const aBorrar = [...idsActuales].filter((aid) => !idsValidos.has(aid));

  if (aInsertar.length > 0) {
    const { error: errorInsertar } = await supabase
      .from("producto_adicionales")
      .insert(
        aInsertar.map((adicionalId) => ({
          comercio_id: contexto.comercio.id,
          producto_id: id,
          adicional_id: adicionalId,
        })),
      );
    if (errorInsertar) {
      console.error(
        `[actualizarProducto] no se pudieron asignar adicionales al producto ${id}: ${errorInsertar.message}`,
      );
    }
  }

  if (aBorrar.length > 0) {
    const { error: errorBorrar } = await supabase
      .from("producto_adicionales")
      .delete()
      .eq("producto_id", id)
      .eq("comercio_id", contexto.comercio.id)
      .in("adicional_id", aBorrar);
    if (errorBorrar) {
      console.error(
        `[actualizarProducto] no se pudieron desasignar adicionales del producto ${id}: ${errorBorrar.message}`,
      );
    }
  }

  revalidatePath("/app/carta/productos");
  revalidatePath("/app/carta/adicionales");
  redirect("/app/carta/productos");
}
