"use client";

import { useState, useTransition } from "react";

import type { ZonaConMesas } from "@/lib/salon/mesas";
import { formatearTiempoAbierta } from "@/lib/salon/tiempo";

import { cargarBorradorEnMesa } from "./actions";

/**
 * El paso final de la pantalla del mozo: elegir la mesa y cargar.
 *
 * Se usa parado al lado de la mesa, con una mano, apurado. De ahí las
 * decisiones:
 *
 * - Las mesas van en el mismo orden que /app/salon (por zona, y dentro de
 *   la zona por `orden`): el mozo ya las tiene memorizadas así. No se
 *   reordenan poniendo las ocupadas primero, aunque sea más probable que
 *   el cliente esté en una ocupada — buscar una mesa en una lista que
 *   cambia de orden es peor que leer un cartelito.
 * - Cada mesa dice si está ocupada y hace cuánto. Una mesa libre se puede
 *   elegir igual: la cuenta se abre en el mismo gesto, y el botón lo
 *   avisa antes de tocarlo.
 * - Un solo botón grande, abajo y fijo, que nombra la mesa elegida. Así no
 *   hay forma de cargarle el pedido a la mesa de al lado por tocar mal.
 *
 * Son `<input type="radio">` de verdad (escondidos, con la tarjeta como
 * etiqueta): un lector de pantalla los lee como "mesa 4, 1 de 19", y el
 * teclado se mueve con las flechas.
 */
export function Confirmacion({
  codigo,
  zonas,
  mesaInicial,
}: {
  codigo: string;
  zonas: ZonaConMesas[];
  /** Mesa preelegida (`?mesa=`), cuando el mozo viene del detalle de una. */
  mesaInicial: string | null;
}) {
  const [mesaId, setMesaId] = useState<string | null>(mesaInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  const mesas = zonas.flatMap((zona) => zona.mesas);
  const elegida = mesas.find((mesa) => mesa.id === mesaId) ?? null;
  const unicaZona = zonas.length === 1;

  function cargar() {
    if (pendiente || mesaId === null) return;
    setError(null);
    iniciarTransicion(async () => {
      // Si sale bien no vuelve: la acción redirige al detalle de la mesa.
      const resultado = await cargarBorradorEnMesa(codigo, mesaId);
      setError(resultado.error);
    });
  }

  return (
    <>
      <section aria-labelledby="titulo-mesa" className="space-y-4">
        <h2 id="titulo-mesa" className="text-lg font-bold text-neutral-900">
          ¿En qué mesa va?
        </h2>

        {zonas.map((zona) => (
          <div key={zona.id} className="space-y-2">
            {!unicaZona && (
              <p className="text-sm font-bold tracking-wide text-neutral-500 uppercase">
                {zona.nombre}
              </p>
            )}
            <div
              role="radiogroup"
              aria-label={`Mesas de ${zona.nombre}`}
              className="grid grid-cols-2 gap-2"
            >
              {zona.mesas.map((mesa) => {
                const seleccionada = mesa.id === mesaId;
                return (
                  <label
                    key={mesa.id}
                    className={`flex min-h-20 cursor-pointer flex-col justify-center rounded-2xl border-2 px-4 py-3 ${
                      seleccionada
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-900 active:bg-neutral-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mesa"
                      value={mesa.id}
                      checked={seleccionada}
                      onChange={() => setMesaId(mesa.id)}
                      disabled={pendiente}
                      className="sr-only"
                    />
                    <span className="text-xl font-bold">{mesa.nombre}</span>
                    <span
                      className={`text-sm font-medium ${
                        seleccionada
                          ? "text-neutral-300"
                          : mesa.cuenta
                            ? "text-amber-700"
                            : "text-green-700"
                      }`}
                    >
                      {mesa.cuenta
                        ? `Ocupada ${formatearTiempoAbierta(mesa.cuenta.abiertaEn)}`
                        : "Libre"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-4 text-base font-semibold text-red-900"
        >
          {error}
        </p>
      )}

      {/* Fijo abajo: con 20 mesas en pantalla, un botón al final de la
          lista obligaría a scrollear de nuevo después de elegir. */}
      <div className="sticky bottom-0 -mx-4 border-t border-neutral-200 bg-neutral-50 px-4 py-3 lg:-mx-8 lg:px-8">
        <button
          type="button"
          onClick={cargar}
          disabled={pendiente || elegida === null}
          className="min-h-16 w-full rounded-2xl bg-green-700 px-5 text-xl font-bold text-white active:bg-green-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
        >
          {pendiente
            ? "Cargando…"
            : elegida === null
              ? "Elegí una mesa"
              : elegida.cuenta
                ? `Cargar en ${elegida.nombre}`
                : `Abrir ${elegida.nombre} y cargar`}
        </button>
      </div>
    </>
  );
}
