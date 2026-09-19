import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarProducto } from "./formulario";

export default async function PaginaEditarProducto({
  params,
}: PageProps<"/app/carta/productos/[id]">) {
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

  // RLS: `productos_leer` (es_miembro) ya lo permite; igual se filtra por
  // comercio_id acá para que un id de otro comercio dé 404, no un permiso
  // denegado ambiguo. Sin `sector_id`: la interfaz ya no lo usa, un
  // producto siempre se prepara en el sector de su categoría (ver
  // docs/SCHEMA.md).
  const { data: producto } = await supabase
    .from("productos")
    .select("id, categoria_id, nombre, descripcion, precio, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!producto) {
    notFound();
  }

  // Todas las categorías (no solo las activas), con el nombre de su
  // sector embebido por la FK `sector_id` (ver Relationships en
  // src/types/database.ts): si la categoría actual del producto ya no
  // está activa, tiene que poder seguir apareciendo seleccionada en vez
  // de romper el <select>.
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nombre, activo, sectores(nombre)")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const categoriasConSector = (categorias ?? []).map((categoria) => ({
    id: categoria.id,
    nombre: categoria.nombre,
    activo: categoria.activo,
    sectorNombre: categoria.sectores?.nombre ?? "—",
  }));

  // Adicionales activos del comercio, para la sección de asignación (item
  // 5): checkbox por cada uno. Si no hay ninguno, el formulario muestra un
  // texto con link a /app/carta/adicionales en vez de la lista.
  const { data: adicionales } = await supabase
    .from("adicionales")
    .select("id, nombre, precio_extra")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  const { data: asignaciones } = await supabase
    .from("producto_adicionales")
    .select("adicional_id")
    .eq("producto_id", producto.id)
    .eq("comercio_id", contexto.comercio.id);

  const adicionalesAsignadosIniciales = (asignaciones ?? []).map(
    (asignacion) => asignacion.adicional_id,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/productos"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Productos
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        {producto.nombre}
      </h1>
      <FormularioEditarProducto
        producto={producto}
        categorias={categoriasConSector}
        adicionales={adicionales ?? []}
        adicionalesAsignadosIniciales={adicionalesAsignadosIniciales}
      />
    </div>
  );
}
