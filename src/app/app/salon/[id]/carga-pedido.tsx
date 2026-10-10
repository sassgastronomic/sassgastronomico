"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { idLocal } from "@/lib/id-local";

import { confirmarPedido } from "./actions";

export type AdicionalPicker = { id: string; nombre: string; precioExtra: number };

export type ProductoPicker = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  descripcion: string | null;
  precio: number;
  adicionales: AdicionalPicker[];
};

export type CategoriaPicker = {
  id: string;
  nombre: string;
  productos: ProductoPicker[];
};

// `categoriaNombre` es solo para mostrar: al confirmar, la categoría que
// queda guardada en el pedido la copia la base (crear_pedido_mozo), no se
// toma de acá.
type ItemCarrito = {
  clave: string;
  productoId: string;
  nombre: string;
  categoriaNombre: string;
  precioUnitario: number;
  cantidad: number;
  nota: string;
  adicionales: AdicionalPicker[];
};

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

function totalItem(item: ItemCarrito): number {
  const extras = item.adicionales.reduce((suma, a) => suma + a.precioExtra, 0);
  return (item.precioUnitario + extras) * item.cantidad;
}

// Sin distinguir mayúsculas ni acentos: quita los diacríticos (NFD +
// sacar los combining marks) antes de comparar, mismo truco que
// normalizarParaUsuario en /app/usuarios/nuevo/formulario.tsx.
function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function FilaProducto({
  producto,
  onSeleccionar,
}: {
  producto: ProductoPicker;
  onSeleccionar: (producto: ProductoPicker) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeleccionar(producto)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-neutral-50"
    >
      <span className="text-base font-medium text-neutral-900">
        {producto.nombre}
      </span>
      <span className="shrink-0 text-base font-semibold text-neutral-600">
        {formateadorPrecio.format(producto.precio)}
      </span>
    </button>
  );
}

// Fila de resultado de búsqueda: a diferencia de FilaProducto (que ya
// está agrupada bajo su categoría, sea en un <details> o en un grupo de
// resultados), acá se repite el nombre de la categoría en cada fila —
// productos con el mismo nombre en categorías distintas ("Completo" en
// Lomitos vs. en Hamburguesas) serían indistinguibles si no.
function FilaResultadoBusqueda({
  producto,
  onSeleccionar,
}: {
  producto: ProductoPicker;
  onSeleccionar: (producto: ProductoPicker) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeleccionar(producto)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-neutral-50"
    >
      <span className="min-w-0">
        <span className="block text-base font-medium text-neutral-900">
          {producto.nombre}
        </span>
        <span className="block text-sm text-neutral-500">
          {producto.categoriaNombre}
        </span>
      </span>
      <span className="shrink-0 text-base font-semibold text-neutral-600">
        {formateadorPrecio.format(producto.precio)}
      </span>
    </button>
  );
}

/**
 * Elegir productos, armar el carrito de la ronda y confirmarla. Pantalla
 * de celular, apurado, una mano. El mozo ya conoce la carta y quiere
 * encontrar rápido, no explorar — por eso el buscador manda: categorías
 * como <details> cerrados por defecto (el mozo abre la que necesita), y
 * mientras hay texto escrito se reemplazan por una lista plana de
 * resultados. Las dos "hojas" (personalizar producto / revisar carrito)
 * ocupan toda la pantalla en vez de ser un modal chico, para no tener que
 * apuntar con precisión.
 */
export function CargaPedido({
  cuentaId,
  categorias,
  accesosRapidos,
}: {
  cuentaId: string;
  categorias: CategoriaPicker[];
  accesosRapidos: ProductoPicker[];
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const [busqueda, setBusqueda] = useState("");
  const refBusqueda = useRef<HTMLInputElement>(null);
  const [productoEnEdicion, setProductoEnEdicion] =
    useState<ProductoPicker | null>(null);
  const [cantidadEdicion, setCantidadEdicion] = useState(1);
  const [notaEdicion, setNotaEdicion] = useState("");
  const [adicionalesEdicion, setAdicionalesEdicion] = useState<Set<string>>(
    new Set(),
  );

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscando = busqueda.trim().length > 0;

  // Buscar "lom" tiene que traer todo "Lomitos"/"Lomos" (coincide la
  // categoría, no el producto — muchos productos son solo la variante,
  // "Completo", "Picante", y es la categoría la que les da sentido) más
  // cualquier producto cuyo propio nombre contenga "lom", esté donde esté.
  // Lo primero se agrupa bajo el nombre de la categoría que matcheó (para
  // que se entienda por qué aparecieron); lo segundo queda suelto, pero
  // ya no puede quedar duplicado si la categoría de ese producto también
  // matcheó.
  const resultados = useMemo(() => {
    if (!buscando) return { grupos: [], sueltos: [] };
    const termino = normalizarBusqueda(busqueda.trim());

    const categoriasQueMatchean = categorias.filter((categoria) =>
      normalizarBusqueda(categoria.nombre).includes(termino),
    );
    const idsEnGrupos = new Set(
      categoriasQueMatchean.flatMap((categoria) =>
        categoria.productos.map((producto) => producto.id),
      ),
    );

    const grupos = categoriasQueMatchean
      .filter((categoria) => categoria.productos.length > 0)
      .map((categoria) => ({
        categoriaId: categoria.id,
        categoriaNombre: categoria.nombre,
        productos: categoria.productos,
      }));

    const sueltos = categorias
      .flatMap((categoria) => categoria.productos)
      .filter(
        (producto) =>
          !idsEnGrupos.has(producto.id) &&
          normalizarBusqueda(producto.nombre).includes(termino),
      );

    return { grupos, sueltos };
  }, [categorias, busqueda, buscando]);

  // `categorias` ya viene filtrada por disponibilidad efectiva
  // (carta_publica, sin los sin_stock) y se mantiene al día sola:
  // ActualizarEnVivo refresca la página cuando cambia un producto, una
  // categoría o un sector. Lo que está en el carrito y ya no figura acá se
  // apagó mientras el mozo armaba la ronda. No se saca solo — el mozo
  // tiene que enterarse para avisarle a la mesa —: se marca en rojo y se
  // bloquea el confirmar hasta que lo quite.
  const idsDisponibles = useMemo(
    () =>
      new Set(
        categorias.flatMap((categoria) =>
          categoria.productos.map((producto) => producto.id),
        ),
      ),
    [categorias],
  );
  const lineasNoDisponibles = carrito.filter(
    (item) => !idsDisponibles.has(item.productoId),
  ).length;
  const edicionNoDisponible =
    productoEnEdicion !== null && !idsDisponibles.has(productoEnEdicion.id);

  const cantidadCarrito = carrito.reduce((suma, item) => suma + item.cantidad, 0);
  const totalCarrito = carrito.reduce((suma, item) => suma + totalItem(item), 0);

  const totalEdicion =
    productoEnEdicion === null
      ? 0
      : (productoEnEdicion.precio +
          productoEnEdicion.adicionales
            .filter((a) => adicionalesEdicion.has(a.id))
            .reduce((suma, a) => suma + a.precioExtra, 0)) *
        cantidadEdicion;

  function abrirEdicion(producto: ProductoPicker) {
    setProductoEnEdicion(producto);
    setCantidadEdicion(1);
    setNotaEdicion("");
    setAdicionalesEdicion(new Set());
  }

  function alternarAdicionalEdicion(id: string) {
    setAdicionalesEdicion((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(id)) {
        siguientes.delete(id);
      } else {
        siguientes.add(id);
      }
      return siguientes;
    });
  }

  function agregarAlCarrito() {
    if (!productoEnEdicion || edicionNoDisponible) return;
    const adicionalesElegidos = productoEnEdicion.adicionales.filter((a) =>
      adicionalesEdicion.has(a.id),
    );
    setCarrito((actual) => [
      ...actual,
      {
        clave: idLocal(),
        productoId: productoEnEdicion.id,
        nombre: productoEnEdicion.nombre,
        categoriaNombre: productoEnEdicion.categoriaNombre,
        precioUnitario: productoEnEdicion.precio,
        cantidad: cantidadEdicion,
        nota: notaEdicion.trim(),
        adicionales: adicionalesElegidos,
      },
    ]);
    setProductoEnEdicion(null);
  }

  function cambiarCantidadLinea(clave: string, delta: number) {
    setCarrito((actual) =>
      actual.map((item) =>
        item.clave === clave
          ? { ...item, cantidad: Math.max(1, item.cantidad + delta) }
          : item,
      ),
    );
  }

  function quitarDelCarrito(clave: string) {
    setCarrito((actual) => actual.filter((item) => item.clave !== clave));
  }

  // El bloqueo de acá es para que el mozo se entere a tiempo; el que manda
  // es crear_pedido_mozo, que vuelve a validar la disponibilidad de cada
  // producto al confirmar (puede apagarse entre el refresco y el toque).
  function confirmar() {
    if (lineasNoDisponibles > 0) return;
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await confirmarPedido(
        cuentaId,
        carrito.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          nota: item.nota,
          adicionales: item.adicionales.map((a) => a.id),
        })),
      );
      if (resultado.ok) {
        setCarrito([]);
        setCarritoAbierto(false);
        router.refresh();
      } else {
        setError(resultado.error);
      }
    });
  }

  return (
    <div>
      {/* En Safari de iPhone quedaba dibujado un "Buscar…" doble. Por eso:
          capa propia (transform-gpu) y campo de texto común con teclado de
          búsqueda, no type="search", que en iOS suma su propia ✕ y una capa
          interna para el texto de ayuda. */}
      <div className="sticky top-0 z-30 -mx-4 transform-gpu bg-neutral-50 px-4 pt-1 pb-3">
        <div className="relative">
          <input
            ref={refBusqueda}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar producto…"
            className="w-full appearance-none rounded-2xl border-2 border-neutral-300 bg-white py-4 pr-14 pl-5 text-lg outline-none focus:border-neutral-900"
          />
          {busqueda.length > 0 && (
            <button
              type="button"
              // Sin esto, tocar la ✕ le saca el foco al campo y cierra el
              // teclado: para buscar otro producto había que volver a tocarlo.
              onPointerDown={(evento) => evento.preventDefault()}
              onClick={() => {
                setBusqueda("");
                refBusqueda.current?.focus();
              }}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-3 py-2 text-2xl leading-none font-bold text-neutral-400 active:bg-neutral-100"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {buscando ? (
        <div className="space-y-4 pb-24">
          {resultados.grupos.length === 0 && resultados.sueltos.length === 0 ? (
            <p className="py-10 text-center text-base text-neutral-500">
              No encontramos productos con ese nombre.
            </p>
          ) : (
            <>
              {resultados.grupos.map((grupo) => (
                <div key={grupo.categoriaId}>
                  <p className="mb-2 text-sm font-semibold text-neutral-500">
                    {grupo.categoriaNombre}
                  </p>
                  <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    {grupo.productos.map((producto) => (
                      <FilaResultadoBusqueda
                        key={producto.id}
                        producto={producto}
                        onSeleccionar={abrirEdicion}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {resultados.sueltos.length > 0 && (
                <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  {resultados.sueltos.map((producto) => (
                    <FilaResultadoBusqueda
                      key={producto.id}
                      producto={producto}
                      onSeleccionar={abrirEdicion}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4 pb-24">
          {accesosRapidos.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-500">
                Más pedidos
              </p>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {accesosRapidos.map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() => abrirEdicion(producto)}
                    className="flex w-40 shrink-0 flex-col justify-between rounded-2xl border-2 border-neutral-200 bg-white p-3 text-left active:bg-neutral-50"
                  >
                    <span>
                      <span className="line-clamp-2 text-sm font-bold text-neutral-900">
                        {producto.nombre}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {producto.categoriaNombre}
                      </span>
                    </span>
                    <span className="mt-2 text-sm font-semibold text-neutral-600">
                      {formateadorPrecio.format(producto.precio)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {categorias.length === 0 ? (
            <p className="py-10 text-center text-base text-neutral-500">
              No hay productos disponibles para pedir ahora.
            </p>
          ) : (
            <div className="space-y-3">
              {categorias.map((categoria) => (
                <details
                  key={categoria.id}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none">
                    <span className="text-lg font-bold text-neutral-900">
                      {categoria.nombre}
                    </span>
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-sm font-medium text-neutral-600">
                      {categoria.productos.length}{" "}
                      {categoria.productos.length === 1
                        ? "producto"
                        : "productos"}
                    </span>
                  </summary>
                  <div className="divide-y divide-neutral-100 border-t border-neutral-200">
                    {categoria.productos.map((producto) => (
                      <FilaProducto
                        key={producto.id}
                        producto={producto}
                        onSeleccionar={abrirEdicion}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {carrito.length > 0 && !productoEnEdicion && !carritoAbierto && (
        <button
          type="button"
          onClick={() => setCarritoAbierto(true)}
          className={`fixed inset-x-0 bottom-0 z-40 flex items-center justify-between px-5 py-4 text-white ${
            lineasNoDisponibles > 0
              ? "bg-red-700 active:bg-red-800"
              : "bg-neutral-900 active:bg-neutral-800"
          }`}
        >
          <span className="text-base font-semibold">
            {lineasNoDisponibles > 0
              ? `${lineasNoDisponibles} no ${lineasNoDisponibles === 1 ? "disponible" : "disponibles"}`
              : `${cantidadCarrito} ${cantidadCarrito === 1 ? "ítem" : "ítems"}`}
          </span>
          <span className="text-lg font-bold">
            {formateadorPrecio.format(totalCarrito)}
          </span>
          <span className="text-base font-semibold">Ver pedido →</span>
        </button>
      )}

      {productoEnEdicion && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
            <button
              type="button"
              onClick={() => setProductoEnEdicion(null)}
              className="text-base font-medium text-neutral-600"
            >
              ← Cancelar
            </button>
          </div>

          <div className="flex-1 space-y-6 px-4 py-5 pb-32">
            {edicionNoDisponible && (
              <p
                role="alert"
                className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-base font-bold text-red-700"
              >
                Este producto se acaba de quedar sin disponibilidad. No se
                puede agregar.
              </p>
            )}
            <div>
              <p className="text-2xl font-bold text-neutral-900">
                {productoEnEdicion.nombre}
              </p>
              <p className="text-base text-neutral-500">
                {productoEnEdicion.categoriaNombre}
              </p>
              {productoEnEdicion.descripcion && (
                <p className="mt-1 text-base text-neutral-500">
                  {productoEnEdicion.descripcion}
                </p>
              )}
              <p className="mt-2 text-xl font-semibold text-neutral-700">
                {formateadorPrecio.format(productoEnEdicion.precio)}
              </p>
            </div>

            {productoEnEdicion.adicionales.length > 0 && (
              <div>
                <p className="mb-2 text-base font-semibold text-neutral-900">
                  Adicionales
                </p>
                <div className="space-y-2">
                  {productoEnEdicion.adicionales.map((adicional) => (
                    <label
                      key={adicional.id}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-neutral-200 px-4 py-3"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={adicionalesEdicion.has(adicional.id)}
                          onChange={() =>
                            alternarAdicionalEdicion(adicional.id)
                          }
                          className="h-6 w-6 rounded border-neutral-300"
                        />
                        <span className="text-base font-medium text-neutral-900">
                          {adicional.nombre}
                        </span>
                      </span>
                      {adicional.precioExtra > 0 && (
                        <span className="text-sm text-neutral-500">
                          +{formateadorPrecio.format(adicional.precioExtra)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="nota-producto"
                className="mb-2 block text-base font-semibold text-neutral-900"
              >
                Nota (opcional)
              </label>
              <input
                id="nota-producto"
                type="text"
                maxLength={140}
                value={notaEdicion}
                onChange={(evento) => setNotaEdicion(evento.target.value)}
                placeholder='Ej: "sin sal", "bien cocida"'
                className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-base outline-none focus:border-neutral-900"
              />
            </div>

            <div>
              <p className="mb-2 text-base font-semibold text-neutral-900">
                Cantidad
              </p>
              <div className="flex items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={() =>
                    setCantidadEdicion((cantidad) => Math.max(1, cantidad - 1))
                  }
                  aria-label="Restar cantidad"
                  className="h-14 w-14 rounded-full bg-neutral-100 text-2xl font-bold text-neutral-900 active:bg-neutral-200"
                >
                  −
                </button>
                <span className="w-10 text-center text-3xl font-bold text-neutral-900">
                  {cantidadEdicion}
                </span>
                <button
                  type="button"
                  onClick={() => setCantidadEdicion((cantidad) => cantidad + 1)}
                  aria-label="Sumar cantidad"
                  className="h-14 w-14 rounded-full bg-neutral-100 text-2xl font-bold text-neutral-900 active:bg-neutral-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-4">
            <button
              type="button"
              onClick={agregarAlCarrito}
              disabled={edicionNoDisponible}
              className="w-full rounded-2xl bg-neutral-900 px-5 py-5 text-xl font-bold text-white active:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {edicionNoDisponible
                ? "No disponible"
                : `Agregar — ${formateadorPrecio.format(totalEdicion)}`}
            </button>
          </div>
        </div>
      )}

      {carritoAbierto && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
            <button
              type="button"
              onClick={() => setCarritoAbierto(false)}
              className="text-base font-medium text-neutral-600"
            >
              ← Seguir pidiendo
            </button>
          </div>

          <div className="flex-1 space-y-3 px-4 py-5 pb-32">
            <p className="text-2xl font-bold text-neutral-900">Tu pedido</p>

            {carrito.length === 0 ? (
              <p className="text-base text-neutral-500">
                Todavía no agregaste nada.
              </p>
            ) : (
              carrito.map((item) => {
                const disponible = idsDisponibles.has(item.productoId);
                return (
                  <div
                    key={item.clave}
                    className={`rounded-2xl border-2 p-4 ${
                      disponible ? "border-neutral-200" : "border-red-500 bg-red-50"
                    }`}
                  >
                    {!disponible && (
                      <p className="mb-2 text-base font-black text-red-700">
                        No disponible — quitalo del pedido
                      </p>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`text-lg font-bold ${
                            disponible
                              ? "text-neutral-900"
                              : "text-red-700 line-through"
                          }`}
                        >
                          {item.nombre}
                        </p>
                        <p className="text-sm text-neutral-500">
                          {item.categoriaNombre}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold text-neutral-900">
                        {formateadorPrecio.format(totalItem(item))}
                      </p>
                    </div>
                    {item.adicionales.length > 0 && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {item.adicionales.map((a) => a.nombre).join(", ")}
                      </p>
                    )}
                    {item.nota && (
                      <p className="mt-1 text-sm text-neutral-500 italic">
                        &quot;{item.nota}&quot;
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => cambiarCantidadLinea(item.clave, -1)}
                          aria-label={`Restar cantidad de ${item.nombre}`}
                          className="h-11 w-11 rounded-full bg-neutral-100 text-xl font-bold text-neutral-900 active:bg-neutral-200"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xl font-bold text-neutral-900">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidadLinea(item.clave, 1)}
                          aria-label={`Sumar cantidad de ${item.nombre}`}
                          className="h-11 w-11 rounded-full bg-neutral-100 text-xl font-bold text-neutral-900 active:bg-neutral-200"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarDelCarrito(item.clave)}
                        className={
                          disponible
                            ? "text-base font-semibold text-red-700"
                            : "rounded-xl bg-red-700 px-5 py-3 text-base font-bold text-white active:bg-red-800"
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700"
              >
                {error}
              </p>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-4">
            <button
              type="button"
              onClick={confirmar}
              disabled={
                pendiente || carrito.length === 0 || lineasNoDisponibles > 0
              }
              className={`w-full rounded-2xl px-5 py-5 text-xl font-bold text-white disabled:cursor-not-allowed ${
                lineasNoDisponibles > 0
                  ? "bg-red-700"
                  : "bg-neutral-900 active:bg-neutral-700 disabled:opacity-60"
              }`}
            >
              {lineasNoDisponibles > 0
                ? lineasNoDisponibles === 1
                  ? "Quitá el producto no disponible para confirmar"
                  : `Quitá los ${lineasNoDisponibles} productos no disponibles para confirmar`
                : pendiente
                  ? "Confirmando…"
                  : `Confirmar pedido — ${formateadorPrecio.format(totalCarrito)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
