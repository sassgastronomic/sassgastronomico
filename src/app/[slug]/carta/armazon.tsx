"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { IconoListo } from "../iconos";
import { TarjetaProducto } from "./piezas";
import type { Carrito } from "./usar-carrito";
import { comportamientoScroll, idSeccion } from "./vistas";

/**
 * El cuerpo de las pantallas de carta del cliente: título, la barra de
 * categorías, las secciones con sus productos, el pie y el cartelito de
 * aviso. Lo comparten la landing de take away (`/{slug}`) y el pedido por
 * QR de mesa (`/{slug}/mesa`).
 *
 * Se explora por categorías —todas a la vista, una debajo de otra, con una
 * barra para saltar entre ellas— y no con un buscador: el cliente no
 * conoce la carta y quiere ver qué hay. Un producto se toca entero (no un
 * "+" chiquito) y se personaliza en una hoja de pantalla completa.
 *
 * Lo que cambia entre las dos pantallas entra por props: el subtítulo, los
 * avisos de arriba (`encabezado`), el pie de la carta y la barra de abajo.
 * Las hojas (producto, pedido, QR) las monta cada pantalla aparte, no
 * esto.
 */
export function ArmazonCarta({
  titulo,
  subtitulo,
  encabezado,
  carrito,
  tomandoPedidos,
  hojaAbierta,
  pieCarta,
  barraInferior,
  onElegirProducto,
}: {
  titulo: string;
  subtitulo: string;
  /** Avisos arriba, debajo del subtítulo (caja cerrada, pedido reciente…). */
  encabezado?: ReactNode;
  carrito: Carrito;
  tomandoPedidos: boolean;
  /** Con una hoja abierta, el cartelito no se muestra: taparía la hoja. */
  hojaAbierta: boolean;
  pieCarta: ReactNode;
  barraInferior: ReactNode;
  onElegirProducto: (productoId: string) => void;
}) {
  const { categoriasVistas, unidadesPorProducto, textoAviso } = carrito;

  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(
    categoriasVistas[0]?.id ?? null,
  );
  const refBarraCategorias = useRef<HTMLDivElement>(null);

  // La categoría que está pasando por arriba de la pantalla se marca en la
  // barra, para que el cliente sepa dónde está.
  useEffect(() => {
    const visibles = new Set<string>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const id = entrada.target.getAttribute("data-categoria");
          if (!id) continue;
          if (entrada.isIntersecting) visibles.add(id);
          else visibles.delete(id);
        }
        const primera = categoriasVistas.find((categoria) =>
          visibles.has(categoria.id),
        );
        if (primera) setCategoriaActiva(primera.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const categoria of categoriasVistas) {
      const seccion = document.getElementById(idSeccion(categoria.id));
      if (seccion) observador.observe(seccion);
    }
    return () => observador.disconnect();
  }, [categoriasVistas]);

  // Que la pastilla activa no quede escondida fuera de la barra.
  useEffect(() => {
    const barra = refBarraCategorias.current;
    if (!barra || !categoriaActiva) return;
    const pastilla = barra.querySelector(`[data-pastilla="${categoriaActiva}"]`);
    if (!(pastilla instanceof HTMLElement)) return;
    barra.scrollTo({
      left: pastilla.offsetLeft - barra.clientWidth / 2 + pastilla.clientWidth / 2,
      behavior: comportamientoScroll(),
    });
  }, [categoriaActiva]);

  function irACategoria(categoriaId: string) {
    setCategoriaActiva(categoriaId);
    document
      .getElementById(idSeccion(categoriaId))
      ?.scrollIntoView({ behavior: comportamientoScroll(), block: "start" });
  }

  return (
    <div className="min-h-dvh flex-1 bg-neutral-50 font-sans text-neutral-900 scheme-light">
      <header className="bg-white">
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-6">
          <h1 className="text-3xl leading-tight font-black tracking-tight text-balance">
            {titulo}
          </h1>
          <p className="mt-2 text-base text-pretty text-neutral-600">
            {subtitulo}
          </p>
          {encabezado}
        </div>
      </header>

      {categoriasVistas.length > 1 && (
        <nav
          aria-label="Categorías de la carta"
          className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur"
        >
          <div
            ref={refBarraCategorias}
            className="relative mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {categoriasVistas.map((categoria) => {
              const activa = categoria.id === categoriaActiva;
              return (
                <button
                  key={categoria.id}
                  type="button"
                  data-pastilla={categoria.id}
                  onClick={() => irACategoria(categoria.id)}
                  aria-current={activa ? "true" : undefined}
                  className={`shrink-0 rounded-full px-4 py-2.5 text-base font-semibold whitespace-nowrap transition-colors ${
                    activa
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
                  }`}
                >
                  {categoria.nombre}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-40">
        {categoriasVistas.map((categoria) => (
          <section
            key={categoria.id}
            id={idSeccion(categoria.id)}
            data-categoria={categoria.id}
            aria-labelledby={`titulo-${idSeccion(categoria.id)}`}
            className="scroll-mt-20 pb-8"
          >
            <h2
              id={`titulo-${idSeccion(categoria.id)}`}
              className="mb-3 text-xl font-bold tracking-tight"
            >
              {categoria.nombre}
            </h2>
            <ul className="space-y-3">
              {categoria.productos.map((producto) => (
                <li key={producto.id}>
                  <TarjetaProducto
                    producto={producto}
                    enElPedido={unidadesPorProducto.get(producto.id) ?? 0}
                    soloVer={!tomandoPedidos}
                    onElegir={() => onElegirProducto(producto.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="space-y-4 pt-2 text-center text-sm text-neutral-500">
          {pieCarta}
        </footer>
      </main>

      {barraInferior}

      {/* Lo lee un lector de pantalla; el cartel de abajo es para la vista. */}
      <p aria-live="polite" className="sr-only">
        {textoAviso}
      </p>
      {textoAviso && !hojaAbierta && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <p className="flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white shadow-lg">
            <IconoListo className="h-5 w-5 shrink-0" />
            {textoAviso}
          </p>
        </div>
      )}
    </div>
  );
}

/** El cartel fijo de abajo cuando el local no está tomando pedidos. */
export function CartelNoTomaPedidos({ texto }: { texto: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="mx-auto max-w-2xl rounded-2xl bg-neutral-800 px-5 py-3.5 text-center text-base font-semibold text-white shadow-lg">
        {texto}
      </p>
    </div>
  );
}
