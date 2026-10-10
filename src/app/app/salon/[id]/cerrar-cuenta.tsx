"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ResumenCuenta } from "@/lib/salon/resumen";

import { cerrarCuenta, type PendientesPorEstado } from "./actions";

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

function describirPendientes(pendientes: PendientesPorEstado): string {
  const partes: string[] = [];
  if (pendientes.pendiente > 0) {
    partes.push(
      `${pendientes.pendiente} pendiente${pendientes.pendiente === 1 ? "" : "s"}`,
    );
  }
  if (pendientes.en_preparacion > 0) {
    partes.push(`${pendientes.en_preparacion} en preparación`);
  }
  if (pendientes.listo > 0) {
    partes.push(
      `${pendientes.listo} listo${pendientes.listo === 1 ? "" : "s"} para llevar`,
    );
  }
  return partes.join(" · ");
}

/**
 * Cerrar la cuenta de la mesa. Pide intención a propósito, en dos pasos:
 * el botón de abajo de todo solo abre la hoja con el resumen, y adentro
 * hay que tildar que se entiende que no se deshace antes de poder
 * confirmar. Así un toque de más (o dos toques seguidos en el mismo lugar)
 * nunca cierra una mesa.
 *
 * Los pendientes que muestra son los de cuando se armó la página; el
 * bloqueo real lo hace la base al cerrar (ver ./actions.ts).
 */
export function CerrarCuenta({
  mesaId,
  mesaNombre,
  resumen,
  pendientes,
}: {
  mesaId: string;
  mesaNombre: string;
  resumen: ResumenCuenta;
  pendientes: PendientesPorEstado;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [abierta, setAbierta] = useState(false);
  const [entendido, setEntendido] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faltan =
    pendientes.pendiente + pendientes.en_preparacion + pendientes.listo;

  function abrir() {
    setEntendido(false);
    setError(null);
    setAbierta(true);
  }

  function confirmar() {
    setError(null);
    iniciarTransicion(async () => {
      // Si cierra, la acción redirige a /app/salon y esto no vuelve.
      const resultado = await cerrarCuenta(mesaId);
      if (resultado.tipo === "pendientes") {
        // Algo cambió desde que se abrió la hoja (otra ronda, cocina
        // devolvió un ítem): se trae el estado real para mostrar qué falta.
        setError(
          `No se pudo cerrar: falta entregar ${describirPendientes(resultado.pendientes)}.`,
        );
        router.refresh();
        return;
      }
      setError(resultado.error);
    });
  }

  return (
    <>
      <section className="space-y-2 border-t-2 border-dashed border-neutral-300 pt-6">
        <p className="text-sm text-neutral-500">
          Cuando la mesa terminó y ya se entregó todo.
        </p>
        <button
          type="button"
          onClick={abrir}
          className="w-full rounded-2xl border-2 border-red-300 bg-white px-5 py-4 text-lg font-bold text-red-700 active:bg-red-50"
        >
          Cerrar la cuenta…
        </button>
      </section>

      {abierta && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
          <div className="border-b border-neutral-200 px-4 py-4">
            <button
              type="button"
              onClick={() => setAbierta(false)}
              className="text-base font-medium text-neutral-600"
            >
              ← Volver
            </button>
          </div>

          <div className="flex-1 space-y-5 px-4 py-5 pb-48">
            <p className="text-2xl font-bold text-neutral-900">
              Cerrar {mesaNombre}
            </p>

            {resumen.lineas.length === 0 ? (
              <p className="text-base text-neutral-500">
                No se cargó nada en esta mesa.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                {resumen.lineas.map((linea) => (
                  <div
                    key={linea.clave}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-bold text-neutral-900">
                        {linea.cantidad}× {linea.nombre}
                      </p>
                      {linea.categoriaNombre && (
                        <p className="text-sm text-neutral-500">
                          {linea.categoriaNombre}
                        </p>
                      )}
                      {linea.adicionalesConCosto.map((adicional) => (
                        <p
                          key={adicional.nombre}
                          className="text-sm text-neutral-600"
                        >
                          + {adicional.nombre} (
                          {formateadorPrecio.format(adicional.precioExtra)})
                        </p>
                      ))}
                      {linea.cantidad > 1 && (
                        <p className="text-xs text-neutral-400">
                          {formateadorPrecio.format(linea.precioUnidad)} c/u
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-base font-semibold text-neutral-900 tabular-nums">
                      {formateadorPrecio.format(linea.subtotal)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl bg-neutral-900 px-5 py-4 text-white">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xl font-semibold">Total</span>
                <span className="text-4xl font-black tabular-nums">
                  {formateadorPrecio.format(resumen.total)}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold tracking-wide text-neutral-300 uppercase">
                Documento no válido como factura
              </p>
            </div>

            {faltan > 0 ? (
              <div
                role="alert"
                className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3"
              >
                <p className="text-lg font-bold text-amber-900">
                  Todavía no se puede cerrar
                </p>
                <p className="mt-1 text-base text-amber-900">
                  Falta entregar {faltan} ítem{faltan === 1 ? "" : "s"}:{" "}
                  {describirPendientes(pendientes)}.
                </p>
              </div>
            ) : (
              <label className="flex items-center gap-3 rounded-2xl border-2 border-neutral-300 px-4 py-4">
                <input
                  type="checkbox"
                  checked={entendido}
                  onChange={(evento) => setEntendido(evento.target.checked)}
                  className="h-7 w-7 shrink-0 rounded border-neutral-300"
                />
                <span className="text-base font-semibold text-neutral-900">
                  Entiendo que cerrar la mesa no se puede deshacer
                </span>
              </label>
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
            {faltan > 0 ? (
              <button
                type="button"
                onClick={() => setAbierta(false)}
                className="w-full rounded-2xl bg-neutral-900 px-5 py-5 text-xl font-bold text-white active:bg-neutral-700"
              >
                Volver a la mesa
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmar}
                disabled={!entendido || pendiente}
                className="w-full rounded-2xl bg-red-600 px-5 py-5 text-xl font-bold text-white active:bg-red-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600"
              >
                {pendiente ? "Cerrando…" : "Cerrar la mesa"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
