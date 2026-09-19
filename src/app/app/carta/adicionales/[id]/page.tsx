import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarAdicional } from "./formulario";

export default async function PaginaEditarAdicional({
  params,
}: PageProps<"/app/carta/adicionales/[id]">) {
  const { id } = await params;

  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // RLS: `adicionales_leer` (es_miembro) ya lo permite; igual se filtra
  // por comercio_id acá para que un id de otro comercio dé 404, no un
  // permiso denegado ambiguo.
  const { data: adicional } = await supabase
    .from("adicionales")
    .select("id, nombre, precio_extra, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!adicional) {
    notFound();
  }

  // Productos activos, agrupados por categoría activa (para la sección de
  // asignación masiva). Dos consultas, nada de una por fila.
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, categoria_id")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const productosPorCategoria = new Map<
    string,
    { id: string; nombre: string }[]
  >();
  for (const producto of productos ?? []) {
    const lista = productosPorCategoria.get(producto.categoria_id) ?? [];
    lista.push({ id: producto.id, nombre: producto.nombre });
    productosPorCategoria.set(producto.categoria_id, lista);
  }

  const categoriasConProductos = (categorias ?? []).map((categoria) => ({
    id: categoria.id,
    nombre: categoria.nombre,
    productos: productosPorCategoria.get(categoria.id) ?? [],
  }));

  // Asignaciones actuales de este adicional.
  const { data: asignaciones } = await supabase
    .from("producto_adicionales")
    .select("producto_id")
    .eq("adicional_id", id)
    .eq("comercio_id", contexto.comercio.id);

  const productosAsignadosIniciales = (asignaciones ?? []).map(
    (asignacion) => asignacion.producto_id,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/adicionales"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Adicionales
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        {adicional.nombre}
      </h1>
      <FormularioEditarAdicional
        adicional={adicional}
        categorias={categoriasConProductos}
        productosAsignadosIniciales={productosAsignadosIniciales}
      />
    </div>
  );
}
