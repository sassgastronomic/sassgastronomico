"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { validarNombreProducto, validarPrecio } from "@/lib/productos/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoNuevoProducto = "categoria_id" | "nombre" | "precio";

export type EstadoNuevoProducto = {
  error?: string;
  campo?: CampoNuevoProducto;
  valores?: {
    categoriaId: string;
    nombre: string;
    descripcion: string;
    precio: string;
  };
};

export async function crearProducto(
  _estadoPrevio: EstadoNuevoProducto,
  formData: FormData,
): Promise<EstadoNuevoProducto> {
  const categoriaId = String(formData.get("categoria_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const precioTexto = String(formData.get("precio") ?? "");

  const valores = { categoriaId, nombre, descripcion, precio: precioTexto };

  // Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  if (!categoriaId) {
    return { error: "Elegí una categoría.", campo: "categoria_id", valores };
  }

  const errorNombre = validarNombreProducto(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  const errorPrecio = validarPrecio(precioTexto);
  if (errorPrecio) return { error: errorPrecio, campo: "precio", valores };

  const precio = Number(precioTexto);

  // Autorización: solo dueño, sin depender del menú ni de que la página lo
  // haya chequeado (esta Server Action es su propio endpoint).
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // La categoría tiene que existir, estar activa y ser de este comercio.
  const { data: categoria, error: errorCategoria } = await supabase
    .from("categorias")
    .select("id")
    .eq("id", categoriaId)
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .maybeSingle();

  if (errorCategoria) {
    return { error: "No se pudo validar la categoría. Probá de nuevo.", valores };
  }
  if (!categoria) {
    return { error: "Elegí una categoría válida.", campo: "categoria_id", valores };
  }

  // El orden se asigna solo: el último de esa categoría + 1. El dueño no
  // lo maneja a mano.
  const { data: ultimo } = await supabase
    .from("productos")
    .select("orden")
    .eq("comercio_id", contexto.comercio.id)
    .eq("categoria_id", categoriaId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orden = (ultimo?.orden ?? -1) + 1;

  // RLS: `productos_duenio` exige `tiene_rol(comercio_id, '{duenio}')`.
  // `sector_id` siempre null: un producto se prepara en el sector de su
  // categoría, no hay forma de pisarlo desde la interfaz (ver
  // docs/SCHEMA.md). La columna se conserva porque la usan las copias en
  // `pedido_items` y `crear_pedido_landing`.
  const { error: errorInsertar } = await supabase.from("productos").insert({
    comercio_id: contexto.comercio.id,
    categoria_id: categoriaId,
    nombre,
    descripcion: descripcion || null,
    precio,
    sector_id: null,
    orden,
  });

  if (errorInsertar) {
    return { error: "No se pudo crear el producto. Probá de nuevo.", valores };
  }

  revalidatePath("/app/carta/productos");
  redirect(`/app/carta/productos?categoria=${categoriaId}`);
}
