import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioNuevoProducto } from "./formulario";

export default async function PaginaNuevoProducto({
  searchParams,
}: PageProps<"/app/carta/productos/nuevo">) {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const parametros = await searchParams;
  const categoriaParametro =
    typeof parametros.categoria === "string" ? parametros.categoria : undefined;

  const supabase = await crearClienteServidor();

  // El nombre del sector viene embebido por la FK `sector_id` de
  // categorías (ver Relationships en src/types/database.ts): un producto
  // siempre se prepara ahí, no hace falta traer sectores aparte.
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nombre, sectores(nombre)")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const categoriasActivas = (categorias ?? []).map((categoria) => ({
    id: categoria.id,
    nombre: categoria.nombre,
    sectorNombre: categoria.sectores?.nombre ?? "—",
  }));

  if (categoriasActivas.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/carta/productos"
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Productos
        </Link>
        <h1 className="text-xl font-semibold text-neutral-900">
          Crear producto
        </h1>
        <div className="max-w-xl rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Necesitás al menos una categoría activa para crear un producto.
          </p>
          <Link
            href="/app/carta/categorias"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Ir a Categorías
          </Link>
        </div>
      </div>
    );
  }

  const categoriaPreseleccionada =
    categoriaParametro &&
    categoriasActivas.some((categoria) => categoria.id === categoriaParametro)
      ? categoriaParametro
      : (categoriasActivas[0]?.id ?? "");

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/productos"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Productos
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        Crear producto
      </h1>
      <FormularioNuevoProducto
        categorias={categoriasActivas}
        categoriaPreseleccionada={categoriaPreseleccionada}
      />
    </div>
  );
}
