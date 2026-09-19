"use client";

import { useRef, useState } from "react";

export type ProductoPreview = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  sinStock: boolean;
  // true si el cliente lo ve hoy en la carta (categoría y producto activos).
  visible: boolean;
  adicionales: { nombre: string; precioExtra: number }[];
};

export type CategoriaPreview = {
  id: string;
  nombre: string;
  sectorNombre: string;
  visible: boolean;
  productos: ProductoPreview[];
};

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

const ESTILO_BADGE_AMBAR =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-600/20";
const ESTILO_BADGE_GRIS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-neutral-500 bg-neutral-100";

/**
 * Vista previa compacta y navegable: cada categoría es un <details>
 * nativo (se abre/cierra clickeando el <summary>, sin necesitar JS para
 * eso). "Expandir todo"/"Contraer todo" sí necesitan JS — como el resto
 * de este componente, que ya es Client Component por el interruptor de
 * inactivos — y manipulan el DOM directo por ref en vez de controlar
 * `open` por estado de React: así el toggle nativo de cada <summary>
 * nunca queda peleado con un re-render.
 */
export function VistaPreviaCarta({
  categorias,
}: {
  categorias: CategoriaPreview[];
}) {
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const refLista = useRef<HTMLDivElement>(null);

  const categoriasVisibles = categorias.filter(
    (categoria) => categoria.visible || mostrarInactivos,
  );

  // Todas cerradas por defecto, salvo que haya una sola categoría en toda
  // la carta (ahí no tiene sentido esconderla). Valor fijo, no estado: ver
  // el comentario de arriba sobre por qué `open` no se controla acá.
  const abiertoPorDefecto = categorias.length === 1;

  function expandirTodo() {
    refLista.current?.querySelectorAll("details").forEach((detalle) => {
      detalle.open = true;
    });
  }

  function contraerTodo() {
    refLista.current?.querySelectorAll("details").forEach((detalle) => {
      detalle.open = false;
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(evento) => setMostrarInactivos(evento.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Mostrar lo inactivo
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={expandirTodo}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Expandir todo
          </button>
          <button
            type="button"
            onClick={contraerTodo}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Contraer todo
          </button>
        </div>
      </div>

      <div
        ref={refLista}
        className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-sm"
      >
        {categoriasVisibles.map((categoria) => {
          const productosVisibles = categoria.productos.filter(
            (producto) => producto.visible || mostrarInactivos,
          );

          return (
            <details
              key={categoria.id}
              open={abiertoPorDefecto}
              className={categoria.visible ? "" : "opacity-60"}
            >
              <summary className="cursor-pointer select-none px-4 py-2.5 sm:px-6">
                <div className="inline-flex w-[calc(100%-1.25rem)] flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 align-middle">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-semibold text-neutral-900">
                      {categoria.nombre}
                    </span>
                    {!categoria.visible && (
                      <span className={ESTILO_BADGE_AMBAR}>
                        No se ve en la carta
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {productosVisibles.length}{" "}
                    {productosVisibles.length === 1 ? "producto" : "productos"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  Sector: {categoria.sectorNombre} (dato interno, el cliente
                  no lo ve)
                </div>
              </summary>

              <div className="divide-y divide-neutral-100 border-t border-neutral-100 px-4 pb-2 sm:px-6">
                {productosVisibles.length === 0 ? (
                  <p className="py-2 text-sm text-neutral-400">
                    Todavía no hay productos acá.
                  </p>
                ) : (
                  productosVisibles.map((producto) => {
                    const claseTexto = producto.sinStock
                      ? "text-neutral-400"
                      : "text-neutral-900";
                    return (
                      <div
                        key={producto.id}
                        className={`py-1.5 ${producto.visible ? "" : "opacity-60"}`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`text-sm font-medium ${claseTexto}`}>
                            {producto.nombre}
                            {producto.sinStock && (
                              <span className={`ml-1.5 ${ESTILO_BADGE_GRIS}`}>
                                Sin stock
                              </span>
                            )}
                            {!producto.visible && (
                              <span className={`ml-1.5 ${ESTILO_BADGE_AMBAR}`}>
                                No se ve en la carta
                              </span>
                            )}
                          </p>
                          <p
                            className={`shrink-0 text-sm font-medium tabular-nums ${claseTexto}`}
                          >
                            {formateadorPrecio.format(producto.precio)}
                          </p>
                        </div>
                        {producto.descripcion && (
                          <p className="text-xs text-neutral-500">
                            {producto.descripcion}
                          </p>
                        )}
                        {producto.adicionales.length > 0 && (
                          <p className="text-xs text-neutral-400">
                            Adicionales:{" "}
                            {producto.adicionales
                              .map((adicional) =>
                                adicional.precioExtra === 0
                                  ? adicional.nombre
                                  : `${adicional.nombre} (+${formateadorPrecio.format(adicional.precioExtra)})`,
                              )
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
