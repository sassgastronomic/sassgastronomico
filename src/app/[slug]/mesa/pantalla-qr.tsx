"use client";

import { QRCodeSVG } from "qrcode.react";

import { formatearPrecio } from "@/lib/landing/precios";

import type { BorradorQr } from "../almacen-local";
import { IconoListo, IconoReloj } from "../iconos";
import { textoRestante, UMBRAL_APURO_MS } from "./vencimiento";

/**
 * El código que el cliente le muestra al mozo, después de confirmar su
 * pedido desde la mesa.
 *
 * El QR es lo único importante de la pantalla, así que va primero y lo más
 * grande que entre: se escanea desde el celular de otra persona, muchas
 * veces con poca luz, a contraluz o con la pantalla llena de reflejos. Por
 * eso además:
 *
 * - **SVG y no canvas**: se dibuja nítido a cualquier tamaño y en cualquier
 *   densidad de pantalla. Un canvas de tamaño fijo estirado por CSS se ve
 *   borroso, y un QR borroso es un QR que no lee.
 * - **Negro puro sobre blanco puro**, con su margen blanco alrededor (el
 *   "quiet zone" que el estándar necesita para encontrar el código) y la
 *   tarjeta blanca atrás. Nada de grises ni de colores de marca acá.
 * - **Corrección de errores "M"** (recupera hasta un 15%): el dato es corto
 *   —un link de unos 40 caracteres—, así que el código entra chico y cada
 *   módulo queda grande; subir a "Q" o "H" agregaría módulos y los haría
 *   más chicos para el mismo tamaño en pantalla, que es justo lo que no
 *   conviene cuando hay reflejos.
 * - Debajo, el código en letras grandes: si la cámara no lo lee, el mozo lo
 *   puede tipear.
 *
 * Si el código vence, la pantalla lo dice y ofrece armar el pedido de
 * nuevo: el carrito quedó vacío al confirmar, pero el resumen de abajo
 * sigue a la vista para que el cliente sepa qué tenía que pedir.
 */
export function PantallaQr({
  nombreComercio,
  borrador,
  restante,
  onVolverALaCarta,
  onEmpezarDeNuevo,
}: {
  nombreComercio: string;
  borrador: BorradorQr;
  // Cuánto falta para que venza, en milisegundos. Lo cuenta el contenedor,
  // con un solo temporizador, para que este número y el aviso de arriba de
  // la carta no se puedan contradecir (ver ./vencimiento.ts).
  restante: number;
  onVolverALaCarta: () => void;
  onEmpezarDeNuevo: () => void;
}) {
  const vencido = restante <= 0;
  const apurado = !vencido && restante <= UMBRAL_APURO_MS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-qr"
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-50 font-sans text-neutral-900 scheme-light"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex-1">
          <p className="text-base font-semibold text-neutral-500">
            {nombreComercio}
          </p>

          {vencido ? (
            <>
              <h1
                id="titulo-qr"
                className="mt-1 text-3xl leading-tight font-black tracking-tight text-balance"
              >
                Tu código venció
              </h1>
              <p className="mt-3 text-lg text-pretty text-neutral-700">
                Pasaron más de 30 minutos y nadie lo escaneó, así que ya no
                vale. Abajo está lo que habías pedido: armalo de nuevo y te
                damos un código nuevo.
              </p>
              <button
                type="button"
                onClick={onEmpezarDeNuevo}
                className="mt-6 w-full rounded-2xl bg-neutral-900 px-6 py-4 text-lg font-bold text-white active:bg-neutral-700"
              >
                Armar el pedido de nuevo
              </button>
            </>
          ) : (
            <>
              <h1
                id="titulo-qr"
                className="mt-1 text-3xl leading-tight font-black tracking-tight text-balance"
              >
                Mostrale esto al mozo
              </h1>
              <p className="mt-3 text-lg font-semibold text-pretty text-neutral-900">
                Tu pedido todavía no entró a la cocina: entra cuando el mozo
                escanee este código.
              </p>

              {/* La tarjeta blanca es parte del código: le da el margen
                  claro que el lector necesita alrededor. */}
              <div className="mt-6 rounded-3xl bg-white p-5 shadow-lg ring-1 ring-neutral-200">
                <QRCodeSVG
                  value={borrador.link}
                  title="Código de tu pedido, para que lo escanee el mozo"
                  size={512}
                  level="M"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  className="h-auto w-full"
                />
                <p className="mt-4 text-center text-sm text-neutral-500">
                  Si la cámara no lo lee, decile este código:
                </p>
                <p className="mt-1 text-center text-3xl font-black tracking-[0.2em] tabular-nums">
                  {borrador.codigo}
                </p>
              </div>

              <p
                role="status"
                className={`mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold ${
                  apurado
                    ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                    : "bg-white text-neutral-700 ring-1 ring-neutral-200"
                }`}
              >
                <IconoReloj className="h-5 w-5 shrink-0" />
                {textoRestante(restante)}
              </p>

              <p className="mt-4 text-base text-pretty text-neutral-600">
                Si tarda en leerlo, subí el brillo de tu pantalla. Podés
                cerrar esta pantalla y volver: el código te queda guardado
                mientras siga valiendo.
              </p>
            </>
          )}

          <section aria-labelledby="titulo-resumen-qr" className="mt-8">
            <h2 id="titulo-resumen-qr" className="text-lg font-bold">
              Lo que pediste
            </h2>
            <ul className="mt-3 divide-y divide-neutral-200 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200">
              {borrador.lineas.map((linea, indice) => (
                <li
                  // No hay id de línea en la foto guardada, y el orden no
                  // cambia nunca: el índice alcanza como clave.
                  key={indice}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold">
                      {linea.cantidad} × {linea.nombre}
                    </p>
                    {linea.categoriaNombre && (
                      <p className="text-sm text-neutral-500">
                        {linea.categoriaNombre}
                      </p>
                    )}
                    {linea.adicionales.length > 0 && (
                      <p className="mt-0.5 text-sm text-neutral-600">
                        Con: {linea.adicionales.join(", ")}
                      </p>
                    )}
                    {linea.nota && (
                      <p className="mt-0.5 text-sm text-neutral-600 italic">
                        “{linea.nota}”
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-base font-semibold tabular-nums">
                    {formatearPrecio(linea.subtotal)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-baseline justify-between gap-4 px-1">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-black tabular-nums">
                {formatearPrecio(borrador.total)}
              </span>
            </div>
            <p className="mt-2 px-1 text-sm text-neutral-600">
              No se paga online: el pago lo arreglás con el local.
            </p>
            <p className="mt-1 px-1 text-xs text-neutral-500">
              Documento no válido como factura.
            </p>
          </section>
        </div>

        <button
          type="button"
          onClick={onVolverALaCarta}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-base font-semibold text-neutral-700 ring-1 ring-neutral-300 active:bg-neutral-100"
        >
          {!vencido && <IconoListo className="h-5 w-5 shrink-0" />}
          Volver a la carta
        </button>
      </div>
    </div>
  );
}
