"use client";

import { useState, type ReactNode } from "react";

import { formatearPrecio, subtotalLinea } from "@/lib/landing/precios";
import { LIMITES_PEDIDO } from "@/lib/landing/validacion";

import { IconoCerrar, IconoMas, IconoMenos } from "../iconos";
import type { LineaVista, ProductoCarta } from "./tipos";

/**
 * Las piezas visuales que comparten la landing de take away (`/{slug}`) y
 * el pedido por QR de mesa (`/{slug}/mesa`): la tarjeta de un producto, la
 * hoja de pantalla completa, el contador de cantidad, la barra del pedido
 * y la línea del pedido. Ninguna sabe en qué pantalla está — todo lo que
 * cambia entra por props.
 *
 * Se usan desde el celular, por gente de cualquier edad y sin
 * explicación: nada chiquito que apuntar, todo con texto además del ícono,
 * y el botón principal siempre a mano abajo.
 */

/**
 * Pantalla completa en el celular (nada chiquito que apuntar), ventana
 * centrada en la compu. Arriba un "← Volver" con texto (más claro que una
 * cruz para cualquiera), y el botón principal fijo abajo, siempre a mano.
 */
export function Hoja({
  etiqueta,
  textoVolver,
  onCerrar,
  pie,
  children,
}: {
  etiqueta: string;
  textoVolver: string;
  onCerrar: () => void;
  pie: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans text-neutral-900 scheme-light sm:bg-neutral-950/40 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[min(90dvh,52rem)] sm:max-w-lg sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-2 py-2">
          <button
            type="button"
            // Al abrir la hoja, el foco entra en ella (teclado y lector de
            // pantalla); en el celular no abre el teclado: es un botón.
            autoFocus
            onClick={onCerrar}
            className="rounded-full px-3 py-2.5 text-base font-semibold text-neutral-700 active:bg-neutral-100"
          >
            ← {textoVolver}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 sm:flex"
          >
            <IconoCerrar className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-8">
          {children}
        </div>
        <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {pie}
        </div>
      </div>
    </div>
  );
}

export function Contador({
  valor,
  etiqueta,
  onRestar,
  onSumar,
}: {
  valor: number;
  etiqueta: string;
  onRestar: () => void;
  onSumar: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="flex items-center gap-1 rounded-full bg-neutral-100 p-1"
    >
      <button
        type="button"
        onClick={onRestar}
        disabled={valor <= 1}
        aria-label="Uno menos"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-sm active:bg-neutral-200 disabled:opacity-40 disabled:shadow-none"
      >
        <IconoMenos className="h-5 w-5" />
      </button>
      <span className="w-9 text-center text-lg font-bold tabular-nums">
        {valor}
      </span>
      <button
        type="button"
        onClick={onSumar}
        disabled={valor >= LIMITES_PEDIDO.cantidad}
        aria-label="Uno más"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-sm active:bg-neutral-200 disabled:opacity-40 disabled:shadow-none"
      >
        <IconoMas className="h-5 w-5" />
      </button>
    </div>
  );
}

export function TarjetaProducto({
  producto,
  enElPedido,
  soloVer,
  onElegir,
}: {
  producto: ProductoCarta;
  enElPedido: number;
  // El local no está tomando pedidos: se muestra, pero no se toca.
  soloVer: boolean;
  onElegir: () => void;
}) {
  if (producto.sinStock) {
    // En gris y con la leyenda, no oculto: si el cliente lo viene a buscar,
    // tiene que entender por qué no lo puede pedir.
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-500">
            {producto.nombre}
          </p>
          {producto.descripcion && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-neutral-400">
              {producto.descripcion}
            </p>
          )}
          <p className="mt-2 inline-flex rounded-full bg-neutral-200 px-2.5 py-1 text-sm font-semibold text-neutral-600">
            Sin stock por ahora
          </p>
        </div>
        <p className="shrink-0 text-base font-semibold text-neutral-400 tabular-nums">
          {formatearPrecio(producto.precio)}
        </p>
      </div>
    );
  }

  if (soloVer) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-900">
            {producto.nombre}
          </p>
          {producto.descripcion && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-neutral-500">
              {producto.descripcion}
            </p>
          )}
        </div>
        <p className="shrink-0 text-base font-bold text-neutral-900 tabular-nums">
          {formatearPrecio(producto.precio)}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onElegir}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] active:bg-neutral-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-neutral-900">
          {producto.nombre}
        </span>
        {producto.descripcion && (
          <span className="mt-1 line-clamp-2 block text-sm leading-snug text-neutral-500">
            {producto.descripcion}
          </span>
        )}
        <span className="mt-2 block text-base font-bold text-neutral-900 tabular-nums">
          {formatearPrecio(producto.precio)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white"
        >
          <IconoMas className="h-5 w-5" />
        </span>
        {enElPedido > 0 && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-emerald-800 ring-1 ring-emerald-600/20">
            {enElPedido} en tu pedido
          </span>
        )}
      </span>
    </button>
  );
}

export function BarraPedido({
  unidades,
  total,
  hayNoDisponibles,
  textoVacio,
  textoAbrir,
  onAbrir,
}: {
  unidades: number;
  total: number;
  hayNoDisponibles: boolean;
  // Lo que dice cuando todavía no hay nada, y el botón cuando sí: cambian
  // entre las dos pantallas ("Tu pedido" / "Tu pedido para la mesa").
  textoVacio: string;
  textoAbrir: string;
  onAbrir: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto max-w-2xl">
        {unidades === 0 ? (
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-3.5 shadow-lg ring-1 ring-neutral-200">
            <span className="min-w-0">
              <span className="block font-semibold text-neutral-900">
                {textoVacio}
              </span>
              <span className="block text-sm text-neutral-500">
                Tocá un producto para agregarlo
              </span>
            </span>
            <span className="shrink-0 text-lg font-bold text-neutral-400 tabular-nums">
              {formatearPrecio(0)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAbrir}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-xl transition ${
              hayNoDisponibles
                ? "bg-red-700 active:bg-red-800"
                : "bg-neutral-900 active:bg-neutral-700"
            }`}
          >
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-white/15 px-2 text-base font-bold tabular-nums">
              {unidades}
            </span>
            <span className="flex-1 text-left text-lg font-semibold">
              {hayNoDisponibles ? "Revisá tu pedido" : textoAbrir}
            </span>
            <span className="text-lg font-bold tabular-nums">
              {formatearPrecio(total)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export function HojaProducto({
  producto,
  onAgregar,
  onCerrar,
}: {
  producto: ProductoCarta;
  onAgregar: (cantidad: number, nota: string, adicionales: string[]) => void;
  onCerrar: () => void;
}) {
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  // Abierta de entrada solo si el ítem ya trae una aclaración (al reabrirlo
  // desde el pedido): si no, escondería algo que ya está escrito.
  const [notaAbierta, setNotaAbierta] = useState(() => nota.length > 0);
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const adicionalesElegidos = producto.adicionales.filter((adicional) =>
    elegidos.has(adicional.id),
  );
  const subtotal = subtotalLinea(
    producto.precio,
    adicionalesElegidos.map((adicional) => adicional.precioExtra),
    cantidad,
  );

  function alternar(id: string) {
    setElegidos((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  return (
    <Hoja
      etiqueta={producto.nombre}
      textoVolver="Volver a la carta"
      onCerrar={onCerrar}
      pie={
        <button
          type="button"
          onClick={() =>
            onAgregar(
              cantidad,
              nota,
              adicionalesElegidos.map((adicional) => adicional.id),
            )
          }
          disabled={producto.sinStock}
          className="flex w-full items-center justify-between gap-4 rounded-2xl bg-neutral-900 px-6 py-4 text-lg font-bold text-white active:bg-neutral-700 disabled:bg-neutral-300 disabled:text-neutral-600"
        >
          <span>
            {producto.sinStock
              ? "Sin stock por ahora"
              : cantidad > 1
                ? `Agregar ${cantidad} al pedido`
                : "Agregar al pedido"}
          </span>
          {!producto.sinStock && (
            <span className="tabular-nums">{formatearPrecio(subtotal)}</span>
          )}
        </button>
      }
    >
      <p className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
        {producto.categoriaNombre}
      </p>
      <h2 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-balance">
        {producto.nombre}
      </h2>
      {producto.descripcion && (
        <p className="mt-2 text-base leading-relaxed text-pretty text-neutral-600">
          {producto.descripcion}
        </p>
      )}
      <p className="mt-3 text-xl font-bold tabular-nums">
        {formatearPrecio(producto.precio)}
      </p>

      {producto.sinStock ? (
        <p className="mt-6 rounded-2xl bg-neutral-100 p-4 text-base font-semibold text-neutral-600">
          Este producto no tiene stock por ahora, así que no se puede pedir.
        </p>
      ) : (
        <>
          {producto.adicionales.length > 0 && (
            <fieldset className="mt-8">
              <legend className="text-lg font-bold">¿Le agregás algo?</legend>
              <p className="text-sm text-neutral-500">
                Opcional. Podés elegir varios.
              </p>
              <div className="mt-3 space-y-2">
                {producto.adicionales.map((adicional) => (
                  <label
                    key={adicional.id}
                    className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-neutral-200 px-4 py-3.5 has-checked:border-neutral-900 has-checked:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={elegidos.has(adicional.id)}
                      onChange={() => alternar(adicional.id)}
                      className="h-6 w-6 shrink-0 accent-neutral-900"
                    />
                    <span className="min-w-0 flex-1 text-base font-medium">
                      {adicional.nombre}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-neutral-600 tabular-nums">
                      {adicional.precioExtra > 0
                        ? `+ ${formatearPrecio(adicional.precioExtra)}`
                        : "Sin cargo"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Escondida detrás de un botón: la mayoría de los productos no
              la necesita (una gaseosa no lleva aclaración) y un campo abierto
              invita a escribir cualquier cosa, que después alguien tiene que
              leer en la cocina. Sigue siendo opcional y se guarda igual. Una
              vez abierta no se vuelve a cerrar: si se cerrara con algo
              escrito, se mandaría una aclaración que el cliente ya no ve. */}
          {notaAbierta ? (
            <div className="mt-8">
              <label htmlFor="nota-producto" className="text-lg font-bold">
                ¿Alguna aclaración?
              </label>
              <p className="text-sm text-neutral-500">Opcional.</p>
              <textarea
                id="nota-producto"
                rows={2}
                // Recién montado, así que el foco y el teclado salen solos:
                // lo acaban de tocar para escribir.
                autoFocus
                maxLength={LIMITES_PEDIDO.notaItem}
                value={nota}
                onChange={(evento) => setNota(evento.target.value)}
                placeholder='Ej: "sin sal", "bien cocida"'
                className="mt-3 w-full resize-none rounded-2xl border-2 border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNotaAbierta(true)}
              className="mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-3.5 text-base font-semibold text-neutral-600 active:bg-neutral-50"
            >
              <IconoMas className="h-5 w-5" />
              Agregar aclaración
            </button>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            <p className="text-lg font-bold">Cantidad</p>
            <Contador
              valor={cantidad}
              etiqueta={`Cantidad de ${producto.nombre}`}
              onRestar={() => setCantidad((actual) => Math.max(1, actual - 1))}
              onSumar={() =>
                setCantidad((actual) =>
                  Math.min(LIMITES_PEDIDO.cantidad, actual + 1),
                )
              }
            />
          </div>
        </>
      )}
    </Hoja>
  );
}

export function LineaDelPedido({
  linea,
  onCambiarCantidad,
  onQuitar,
}: {
  linea: LineaVista;
  onCambiarCantidad: (delta: number) => void;
  onQuitar: () => void;
}) {
  const disponible = linea.subtotal !== null;
  return (
    <li className={`p-4 ${disponible ? "bg-white" : "bg-red-50"}`}>
      {!disponible && (
        <p className="mb-2 text-base font-bold text-red-700">
          {linea.motivo}: sacalo para poder seguir.
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-base font-semibold ${
              disponible ? "text-neutral-900" : "text-red-800 line-through"
            }`}
          >
            {linea.nombre}
          </p>
          {linea.categoriaNombre && (
            <p className="text-sm text-neutral-500">{linea.categoriaNombre}</p>
          )}
          {linea.adicionales.length > 0 && (
            <p className="mt-0.5 text-sm text-neutral-600">
              Con: {linea.adicionales.map((adicional) => adicional.nombre).join(", ")}
            </p>
          )}
          {linea.nota && (
            <p className="mt-0.5 text-sm text-neutral-600 italic">
              “{linea.nota}”
            </p>
          )}
        </div>
        {linea.subtotal !== null && (
          <p className="shrink-0 text-base font-semibold tabular-nums">
            {formatearPrecio(linea.subtotal)}
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {disponible ? (
          <Contador
            valor={linea.cantidad}
            etiqueta={`Cantidad de ${linea.nombre}`}
            onRestar={() => onCambiarCantidad(-1)}
            onSumar={() => onCambiarCantidad(1)}
          />
        ) : (
          <span className="text-sm text-red-800">
            {linea.cantidad} {linea.cantidad === 1 ? "unidad" : "unidades"}
          </span>
        )}
        <button
          type="button"
          onClick={onQuitar}
          className={
            disponible
              ? "rounded-full px-3 py-2.5 text-base font-semibold text-neutral-500 active:bg-neutral-100"
              : "rounded-xl bg-red-700 px-5 py-3 text-base font-bold text-white active:bg-red-800"
          }
        >
          Quitar
        </button>
      </div>
    </li>
  );
}

/** Las líneas del pedido, tal como se leen al revisarlo antes de mandarlo. */
export function ResumenLineas({ lineas }: { lineas: LineaVista[] }) {
  return (
    <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 px-4">
      {lineas.map((linea) => (
        <li
          key={linea.clave}
          className="flex items-start justify-between gap-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-base font-semibold">
              {linea.cantidad} × {linea.nombre}
            </p>
            {linea.categoriaNombre && (
              <p className="text-sm text-neutral-500">{linea.categoriaNombre}</p>
            )}
            {linea.adicionales.length > 0 && (
              <p className="mt-0.5 text-sm text-neutral-600">
                Con:{" "}
                {linea.adicionales
                  .map((adicional) => adicional.nombre)
                  .join(", ")}
              </p>
            )}
            {linea.nota && (
              <p className="mt-0.5 text-sm text-neutral-600 italic">
                “{linea.nota}”
              </p>
            )}
          </div>
          <p className="shrink-0 text-base font-semibold tabular-nums">
            {formatearPrecio(linea.subtotal ?? 0)}
          </p>
        </li>
      ))}
    </ul>
  );
}
