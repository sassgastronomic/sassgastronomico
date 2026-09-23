"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { formatearTiempoAbierta } from "@/lib/salon/tiempo";

import { abrirCuenta } from "./actions";

export type MesaSalon = {
  id: string;
  nombre: string;
  cuenta: { abiertaEn: string } | null;
};

export type ZonaSalon = {
  id: string;
  nombre: string;
  mesas: MesaSalon[];
};

const ESTILO_BADGE_AMBAR =
  "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800";
const ESTILO_BADGE_GRIS =
  "inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-sm font-medium text-neutral-600";

function claveAlmacenamiento(comercioId: string, usuarioId: string): string {
  return `salon:zonas-abiertas:${comercioId}:${usuarioId}`;
}

// El evento nativo "storage" no llega a la misma pestaña que escribió —
// alcanza igual para que useSyncExternalStore sepa que tiene que volver a
// leer, porque guardarZonasAbiertas() lo dispara a mano después de cada
// escritura (ver más abajo).
function suscribirseAAlmacenamiento(notificar: () => void): () => void {
  window.addEventListener("storage", notificar);
  return () => window.removeEventListener("storage", notificar);
}

function obtenerSnapshotServidor(): string | null {
  return null;
}

function leerAlmacenamiento(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarZonasAbiertas(clave: string, ids: string[]): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(ids));
    window.dispatchEvent(new Event("storage"));
  } catch {
    // Modo privado, storage lleno o bloqueado: la pantalla sigue andando,
    // solo no recuerda qué dejó abierto para la próxima.
  }
}

/**
 * Set de zonas abiertas a partir del string crudo de localStorage. Sin
 * nada guardado (o si no se pudo parsear), todas abiertas — ese es el
 * default la primera vez que un mozo entra acá.
 */
function parsearAbiertas(crudo: string | null, zonas: ZonaSalon[]): Set<string> {
  if (crudo !== null) {
    try {
      const parseado: unknown = JSON.parse(crudo);
      if (Array.isArray(parseado)) {
        return new Set(
          parseado.filter(
            (valor): valor is string => typeof valor === "string",
          ),
        );
      }
    } catch {
      // Sigue al default de abajo.
    }
  }
  return new Set(zonas.map((zona) => zona.id));
}

/**
 * Zonas como <details>/<summary>, mismo patrón que /app/carta y
 * /app/mesas — con una diferencia a propósito: acá se recuerda qué dejó
 * abierto el mozo (localStorage por comercio + usuario, vía
 * useSyncExternalStore: esta pantalla se usa decenas de veces por turno,
 * no puede arrancar siempre cerrada). Con una sola zona, siempre abierta
 * — ni siquiera consulta el storage.
 */
export function ListadoSalon({
  zonas,
  comercioId,
  usuarioId,
}: {
  zonas: ZonaSalon[];
  comercioId: string;
  usuarioId: string;
}) {
  const unicaZona = zonas.length === 1;
  const clave = claveAlmacenamiento(comercioId, usuarioId);

  // getServerSnapshot (null) es lo que también usa React en el primer
  // render del cliente, antes de hidratar — coincide con el HTML del
  // servidor (que tampoco puede leer localStorage), así que no hay
  // desajuste de hidratación.
  const crudo = useSyncExternalStore(
    suscribirseAAlmacenamiento,
    () => leerAlmacenamiento(clave),
    obtenerSnapshotServidor,
  );

  const abiertas = parsearAbiertas(crudo, zonas);

  function alCambiarApertura(zonaId: string, abierta: boolean) {
    if (unicaZona) return;
    const siguientes = new Set(abiertas);
    if (abierta) {
      siguientes.add(zonaId);
    } else {
      siguientes.delete(zonaId);
    }
    guardarZonasAbiertas(clave, [...siguientes]);
  }

  return (
    <div className="space-y-3">
      {zonas.map((zona) => {
        const ocupadas = zona.mesas.filter(
          (mesa) => mesa.cuenta !== null,
        ).length;
        const abierta = unicaZona || abiertas.has(zona.id);

        return (
          <details
            key={zona.id}
            open={abierta}
            onToggle={(evento) =>
              alCambiarApertura(zona.id, evento.currentTarget.open)
            }
            className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none">
              <span className="text-lg font-bold text-neutral-900">
                {zona.nombre}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {ocupadas > 0 && (
                  <span className={ESTILO_BADGE_AMBAR}>
                    {ocupadas} ocupada{ocupadas === 1 ? "" : "s"}
                  </span>
                )}
                <span className={ESTILO_BADGE_GRIS}>
                  {zona.mesas.length} mesa{zona.mesas.length === 1 ? "" : "s"}
                </span>
              </span>
            </summary>

            <div className="grid grid-cols-1 gap-3 border-t border-neutral-200 p-4 sm:grid-cols-2">
              {zona.mesas.map((mesa) =>
                mesa.cuenta ? (
                  <Link
                    key={mesa.id}
                    href={`/app/salon/${mesa.id}`}
                    className="flex min-h-28 flex-col justify-between rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 active:bg-amber-100"
                  >
                    <span className="text-2xl font-bold text-neutral-900">
                      {mesa.nombre}
                    </span>
                    <span className="flex items-center justify-between">
                      <span className="text-base font-semibold text-amber-800">
                        ● Ocupada
                      </span>
                      <span className="text-base text-amber-700">
                        {formatearTiempoAbierta(mesa.cuenta.abiertaEn)}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <form key={mesa.id} action={abrirCuenta.bind(null, mesa.id)}>
                    <button
                      type="submit"
                      className="flex min-h-28 w-full flex-col justify-between rounded-2xl border-2 border-green-300 bg-green-50 p-5 text-left active:bg-green-100"
                    >
                      <span className="text-2xl font-bold text-neutral-900">
                        {mesa.nombre}
                      </span>
                      <span className="text-base font-semibold text-green-800">
                        ● Libre — tocar para abrir
                      </span>
                    </button>
                  </form>
                ),
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
