"use client";

import { useState, useTransition } from "react";

import { cambiarQrMesa } from "./actions";

/**
 * El interruptor del pedido por QR de mesa, en la pantalla donde el dueño
 * configura el salón.
 *
 * Viene apagado: es una forma de trabajar que el local tiene que elegir, no
 * algo que le aparezca solo. Mientras está prendido, el link de abajo es el
 * que va impreso en las mesas — **el mismo para todas**: el cliente no
 * elige mesa, la elige el mozo al escanear el código que la pantalla del
 * cliente le muestra.
 *
 * El estado que manda es el del servidor (`activo`), que llega por props y
 * se rearma con `revalidatePath`. `optimista` es solo para que el
 * interruptor no quede quieto mientras viaja la llamada.
 */
export function InterruptorQrMesa({
  activo,
  linkMesa,
}: {
  activo: boolean;
  // Absoluto: es para copiar y generar el QR impreso, no para navegar.
  linkMesa: string;
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimista, setOptimista] = useState<boolean | null>(null);
  const [copiado, setCopiado] = useState(false);

  const prendido = optimista ?? activo;

  function alternar() {
    if (pendiente) return;
    const siguiente = !prendido;
    setError(null);
    setOptimista(siguiente);

    iniciarTransicion(async () => {
      const resultado = await cambiarQrMesa(siguiente);
      setOptimista(null);
      if (!resultado.ok) setError(resultado.error);
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkMesa);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o sin https): el link está a la vista
      // igual, se puede seleccionar a mano.
      setError("No se pudo copiar. Seleccioná el link y copialo a mano.");
    }
  }

  return (
    <section
      aria-labelledby="titulo-qr-mesa"
      className="rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="titulo-qr-mesa"
            className="text-sm font-semibold text-neutral-900"
          >
            Pedido por QR en la mesa
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            El cliente arma su pedido en el celular y le muestra un código al
            mozo, que elige la mesa y lo carga. Nada entra a la cocina hasta
            que el mozo lo escanea.
          </p>
        </div>

        {/* Un switch de verdad (`role="switch"`), no un checkbox disfrazado:
            así un lector de pantalla dice "activado/desactivado". */}
        <button
          type="button"
          role="switch"
          aria-checked={prendido}
          aria-labelledby="titulo-qr-mesa"
          onClick={alternar}
          disabled={pendiente}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            prendido ? "bg-neutral-900" : "bg-neutral-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              prendido ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {prendido && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <p className="text-sm font-medium text-neutral-700">
            El QR de las mesas apunta acá
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Es el mismo para todas las mesas: generá un QR con este link e
            imprimilo.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-neutral-100 px-3 py-2 text-sm whitespace-nowrap text-neutral-800">
              {linkMesa}
            </code>
            <button
              type="button"
              onClick={copiar}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
            >
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
