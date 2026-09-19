import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { VistaPreviaCarta, type CategoriaPreview } from "./vista-previa";

type ResultadoVistaPrevia =
  | { categorias: CategoriaPreview[]; error: null }
  | { categorias: null; error: string };

type ResumenSecciones = {
  sectoresActivos: number;
  categoriasActivas: number;
  productosActivos: number;
  adicionalesActivos: number;
};

type ItemNav = {
  href: string;
  etiqueta: string;
  habilitado: boolean;
  // null cuando no se pudo calcular (ver obtenerResumenSecciones): no se
  // muestra ningún número, pero tampoco se bloquea el acceso por eso — es
  // una ayuda visual, no una validación.
  contador: number | null;
  singular: string;
  plural: string;
  motivoBloqueo: string;
};

/**
 * Cuenta sectores, categorías, productos y adicionales activos del
 * comercio, para la barra de accesos: habilitar/deshabilitar según el
 * orden real en que hay que cargar las cosas, y mostrar cuánto hay
 * cargado en cada sección. Cuatro consultas de solo conteo (`head: true`,
 * sin traer filas) en paralelo.
 */
async function obtenerResumenSecciones(
  comercioId: string,
): Promise<ResumenSecciones | null> {
  const supabase = await crearClienteServidor();

  const [sectores, categorias, productos, adicionales] = await Promise.all([
    supabase
      .from("sectores")
      .select("id", { count: "exact", head: true })
      .eq("comercio_id", comercioId)
      .eq("activo", true),
    supabase
      .from("categorias")
      .select("id", { count: "exact", head: true })
      .eq("comercio_id", comercioId)
      .eq("activo", true),
    supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("comercio_id", comercioId)
      .eq("activo", true),
    supabase
      .from("adicionales")
      .select("id", { count: "exact", head: true })
      .eq("comercio_id", comercioId)
      .eq("activo", true),
  ]);

  if (sectores.error || categorias.error || productos.error || adicionales.error) {
    return null;
  }

  return {
    sectoresActivos: sectores.count ?? 0,
    categoriasActivas: categorias.count ?? 0,
    productosActivos: productos.count ?? 0,
    adicionalesActivos: adicionales.count ?? 0,
  };
}

/**
 * Arma los 4 accesos de la barra lateral, habilitados según el orden real
 * en que hay que cargar las cosas (docs/SCHEMA.md: sectores → categorías →
 * productos; adicionales no depende de nada). Si `resumen` no se pudo
 * calcular, todo queda habilitado por las dudas (no bloquear por un error
 * nuestro) y sin contador.
 */
function construirItemsNav(resumen: ResumenSecciones | null): ItemNav[] {
  return [
    {
      href: "/app/carta/sectores",
      etiqueta: "Sectores",
      habilitado: true,
      contador: resumen?.sectoresActivos ?? null,
      singular: "sector",
      plural: "sectores",
      motivoBloqueo: "",
    },
    {
      href: "/app/carta/categorias",
      etiqueta: "Categorías",
      habilitado: resumen === null || resumen.sectoresActivos > 0,
      contador: resumen?.categoriasActivas ?? null,
      singular: "categoría",
      plural: "categorías",
      motivoBloqueo: "Primero creá un sector",
    },
    {
      href: "/app/carta/productos",
      etiqueta: "Productos",
      habilitado: resumen === null || resumen.categoriasActivas > 0,
      contador: resumen?.productosActivos ?? null,
      singular: "producto",
      plural: "productos",
      motivoBloqueo: "Primero creá una categoría",
    },
    {
      href: "/app/carta/adicionales",
      etiqueta: "Adicionales",
      habilitado: true,
      contador: resumen?.adicionalesActivos ?? null,
      singular: "adicional",
      plural: "adicionales",
      motivoBloqueo: "",
    },
  ];
}

/**
 * Arma la vista previa con `carta_publica(slug)` como fuente de verdad para
 * lo que el cliente ve hoy (misma función que va a alimentar la landing:
 * nada de reimplementar ese filtro/orden acá) y la completa con consultas
 * propias para lo que esa función no puede dar:
 *
 * - Categorías y productos inactivos: `carta_publica` los deja afuera
 *   (filtra `cat.activo` / `p.activo`), pero achá hay que mostrarlos
 *   igual, atenuados, para que el dueño entienda por qué no aparecen.
 * - El sector de cada categoría: es un dato interno para el dueño, no le
 *   importa al cliente, así que la función ni lo devuelve.
 */
async function obtenerVistaPrevia(
  comercioId: string,
  slug: string,
): Promise<ResultadoVistaPrevia> {
  const supabase = await crearClienteServidor();

  const { data: cartaPublica, error: errorCartaPublica } = await supabase.rpc(
    "carta_publica",
    { p_slug: slug },
  );

  if (errorCartaPublica) {
    return {
      categorias: null,
      error: "No se pudo cargar la vista previa. Probá de nuevo en un momento.",
    };
  }

  const { data: categorias, error: errorCategorias } = await supabase
    .from("categorias")
    .select("id, nombre, activo, sectores(nombre)")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorCategorias || !categorias) {
    return {
      categorias: null,
      error: "No se pudo cargar la vista previa. Probá de nuevo en un momento.",
    };
  }

  const { data: productos, error: errorProductos } = await supabase
    .from("productos")
    .select("id, categoria_id, nombre, descripcion, precio, sin_stock, activo")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (errorProductos || !productos) {
    return {
      categorias: null,
      error: "No se pudo cargar la vista previa. Probá de nuevo en un momento.",
    };
  }

  const { data: asignaciones, error: errorAsignaciones } = await supabase
    .from("producto_adicionales")
    .select("producto_id, adicionales(nombre, precio_extra, activo)")
    .eq("comercio_id", comercioId);

  if (errorAsignaciones) {
    return {
      categorias: null,
      error: "No se pudo cargar la vista previa. Probá de nuevo en un momento.",
    };
  }

  const adicionalesPorProducto = new Map<
    string,
    { nombre: string; precioExtra: number }[]
  >();
  for (const asignacion of asignaciones) {
    if (!asignacion.adicionales?.activo) continue;
    const lista = adicionalesPorProducto.get(asignacion.producto_id) ?? [];
    lista.push({
      nombre: asignacion.adicionales.nombre,
      precioExtra: asignacion.adicionales.precio_extra,
    });
    adicionalesPorProducto.set(asignacion.producto_id, lista);
  }

  const productosPorCategoria = new Map<string, typeof productos>();
  for (const producto of productos) {
    const lista = productosPorCategoria.get(producto.categoria_id) ?? [];
    lista.push(producto);
    productosPorCategoria.set(producto.categoria_id, lista);
  }

  const categoriasPreview: CategoriaPreview[] = categorias.map((categoria) => {
    const categoriaPublica =
      cartaPublica?.categorias.find((c) => c.id === categoria.id) ?? null;

    const productosDeCategoria = productosPorCategoria.get(categoria.id) ?? [];

    return {
      id: categoria.id,
      // Preferir el nombre que devuelve la función cuando está disponible:
      // es la fuente de verdad de lo publicado.
      nombre: categoriaPublica?.nombre ?? categoria.nombre,
      sectorNombre: categoria.sectores?.nombre ?? "—",
      visible: categoria.activo,
      productos: productosDeCategoria.map((producto) => {
        const deberiaSerVisible = categoria.activo && producto.activo;
        const productoPublico = deberiaSerVisible
          ? (categoriaPublica?.productos.find((p) => p.id === producto.id) ??
            null)
          : null;

        // Si es visible, los datos salen de carta_publica (fuente de
        // verdad); si no, se completan con lo que ya se trajo por consulta
        // propia.
        const datos = productoPublico ?? {
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          precio: producto.precio,
          sin_stock: producto.sin_stock,
          adicionales: (adicionalesPorProducto.get(producto.id) ?? []).map(
            (adicional) => ({
              nombre: adicional.nombre,
              precio_extra: adicional.precioExtra,
            }),
          ),
        };

        return {
          id: producto.id,
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          precio: datos.precio,
          sinStock: datos.sin_stock,
          visible: deberiaSerVisible,
          adicionales: datos.adicionales.map((adicional) => ({
            nombre: adicional.nombre,
            precioExtra: adicional.precio_extra,
          })),
        };
      }),
    };
  });

  return { categorias: categoriasPreview, error: null };
}

export default async function PaginaCarta() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const [resultado, resumen] = await Promise.all([
    obtenerVistaPrevia(contexto.comercio.id, contexto.comercio.slug),
    obtenerResumenSecciones(contexto.comercio.id),
  ]);

  const hayAlgoCargado =
    resultado.categorias !== null &&
    resultado.categorias.some((categoria) => categoria.productos.length > 0);

  const itemsNav = construirItemsNav(resumen);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Carta</h1>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="flex flex-row flex-wrap gap-3 lg:w-44 lg:shrink-0 lg:flex-col lg:gap-2">
          {itemsNav.map((item) => (
            <div key={item.href} className="min-w-34">
              {item.habilitado ? (
                <Link
                  href={item.href}
                  className="block rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50 lg:px-3 lg:py-2"
                >
                  {item.etiqueta} →
                </Link>
              ) : (
                <span className="block cursor-not-allowed rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-400 lg:px-3 lg:py-2">
                  {item.etiqueta}
                </span>
              )}
              {item.habilitado ? (
                item.contador !== null && (
                  <p className="mt-1 px-1 text-xs text-neutral-400">
                    {item.contador}{" "}
                    {item.contador === 1 ? item.singular : item.plural}
                  </p>
                )
              ) : (
                <p className="mt-1 px-1 text-xs text-amber-600">
                  {item.motivoBloqueo}
                </p>
              )}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {resultado.error !== null && (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {resultado.error}
            </p>
          )}

          {resultado.error === null && !hayAlgoCargado && (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
              <p className="mb-4 text-sm text-neutral-500">
                Todavía no hay nada para mostrar en la carta. Para armarla:
                creá al menos un sector, después una categoría (con ese
                sector), y ahí ya vas a poder cargar productos.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/app/carta/sectores"
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
                >
                  Ir a Sectores
                </Link>
                <Link
                  href="/app/carta/categorias"
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  Ir a Categorías
                </Link>
                <Link
                  href="/app/carta/productos"
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  Ir a Productos
                </Link>
              </div>
            </div>
          )}

          {resultado.error === null && hayAlgoCargado && (
            <VistaPreviaCarta categorias={resultado.categorias} />
          )}
        </div>
      </div>
    </div>
  );
}
