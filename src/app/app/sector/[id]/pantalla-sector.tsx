"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { formatearTiempoAbierta } from "@/lib/salon/tiempo";
import { estaDemorado } from "@/lib/sector/tiempo";
import { suscribirseConSesion } from "@/lib/supabase/realtime";
import type { EstadoItem } from "@/types/database";

import { avanzarItem, avanzarPedido, retrocederItem } from "./actions";

export type ItemPedido = {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  cantidad: number;
  nota: string | null;
  estado: EstadoItem;
  adicionales: string[];
};

export type PedidoConItems = {
  id: string;
  numero: number | null;
  creadoEn: string;
  mesaNombre: string | null;
  items: ItemPedido[];
};

const ETIQUETA_ESTADO: Record<EstadoItem, string> = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
};

// Nunca "cambia" en el sentido de useSyncExternalStore (es una capacidad
// del navegador, no un valor que varíe en caliente) — el único motivo de
// usar este hook en vez de un simple useState es evitar leer `navigator`
// durante el render del servidor (no existe ahí) sin caer en un setState
// dentro de un efecto, que el lint del proyecto bloquea.
function suscribirseNunca(): () => void {
  return () => {};
}
function hayWakeLockEnNavegador(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}
function hayWakeLockEnServidor(): boolean {
  return false;
}

function filtrarPorSolapa(
  pedidos: PedidoConItems[],
  solapa: "en_cocina" | "listos",
): PedidoConItems[] {
  return pedidos
    .map((pedido) => ({
      ...pedido,
      items: pedido.items.filter((item) =>
        solapa === "en_cocina" ? item.estado !== "listo" : item.estado === "listo",
      ),
    }))
    .filter((pedido) => pedido.items.length > 0);
}

/**
 * Pantalla de sector: se lee de un metro de distancia y se toca con las
 * manos ocupadas — todo grande, alto contraste, nada de texto chico. Dos
 * mecanismos que no existían en ninguna otra pantalla del proyecto hasta
 * ahora:
 *
 * - Realtime (`pedido_items`, filtrado por sector): en vez de mezclar el
 *   payload del evento a mano, cualquier cambio dispara `router.refresh()`
 *   y trae el estado real de vuelta — así una reconexión después de un
 *   corte de wifi (el callback de estado vuelve a pasar por "SUBSCRIBED")
 *   se resuelve sola, sin depender de qué eventos se perdieron mientras
 *   tanto.
 * - Wake Lock: mantiene la pantalla encendida mientras esto está abierto,
 *   con un interruptor para apagarlo. El navegador libera el lock solo en
 *   cuanto la pestaña deja de estar visible, así que hay que volver a
 *   pedirlo cada vez que vuelve a primer plano.
 */
export function PantallaSector({
  sectorId,
  pedidos,
}: {
  sectorId: string;
  pedidos: PedidoConItems[];
}) {
  const router = useRouter();
  const [solapa, setSolapa] = useState<"en_cocina" | "listos">("en_cocina");
  const [avisoNuevo, setAvisoNuevo] = useState(false);
  const [conectado, setConectado] = useState(true);
  const [wakeLockActivo, setWakeLockActivo] = useState(true);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockSoportado = useSyncExternalStore(
    suscribirseNunca,
    hayWakeLockEnNavegador,
    hayWakeLockEnServidor,
  );

  useEffect(() => {
    if (!wakeLockSoportado || !wakeLockActivo) {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return;
    }

    let cancelado = false;

    async function pedirWakeLock() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelado) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        // Rechazado (pestaña no visible, política del dispositivo, etc.):
        // no hay nada que mostrarle al usuario por esto — se reintenta
        // solo cuando vuelva a estar visible, más abajo.
      }
    }

    function alCambiarVisibilidad() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void pedirWakeLock();
      }
    }

    void pedirWakeLock();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [wakeLockActivo, wakeLockSoportado]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let huboInsert = false;

    // Los inserts se agrupan: un pedido con varios ítems dispara varios
    // eventos casi juntos, y no tiene sentido refrescar (ni avisar "pedido
    // nuevo") una vez por cada uno.
    function programarRefresco(esInsert: boolean) {
      if (esInsert) huboInsert = true;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (huboInsert) {
          setAvisoNuevo(true);
          setTimeout(() => setAvisoNuevo(false), 4000);
        }
        huboInsert = false;
        router.refresh();
      }, 400);
    }

    // Solo escucha `pedido_items`. Hoy alcanza porque todo pedido nace
    // `confirmado` (lo carga el mozo), pero cuando el mostrador confirme o
    // cancele pedidos va a cambiar `pedidos.estado` sin tocar sus ítems, y
    // esta pantalla (que filtra por pedido confirmado) no se va a enterar:
    // ahí hay que sumar una suscripción a `pedidos`.
    const desuscribirse = suscribirseConSesion((supabase) =>
      supabase
        .channel(`sector-${sectorId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pedido_items",
            filter: `sector_id=eq.${sectorId}`,
          },
          (payload) => programarRefresco(payload.eventType === "INSERT"),
        )
        .subscribe((estado) => {
          setConectado(estado === "SUBSCRIBED");
          if (estado === "SUBSCRIBED") {
            router.refresh();
          }
        }),
    );

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      desuscribirse();
    };
  }, [sectorId, router]);

  async function alAvanzarItem(itemId: string) {
    await avanzarItem(itemId, sectorId);
    router.refresh();
  }

  async function alAvanzarPedido(pedidoId: string) {
    await avanzarPedido(pedidoId, sectorId);
    router.refresh();
  }

  async function alRetrocederItem(itemId: string) {
    await retrocederItem(itemId, sectorId);
    router.refresh();
  }

  const pedidosVisibles = filtrarPorSolapa(pedidos, solapa);

  return (
    <div className="space-y-4">
      {!conectado && (
        <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg font-bold text-amber-800">
          Reconectando…
        </p>
      )}

      {avisoNuevo && (
        <p className="animate-pulse rounded-lg border-4 border-blue-500 bg-blue-50 px-4 py-3 text-center text-xl font-black text-blue-800">
          Pedido nuevo
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSolapa("en_cocina")}
            className={`rounded-full px-6 py-3 text-lg font-bold ${
              solapa === "en_cocina"
                ? "bg-neutral-900 text-white"
                : "border-2 border-neutral-300 bg-white text-neutral-700"
            }`}
          >
            En cocina
          </button>
          <button
            type="button"
            onClick={() => setSolapa("listos")}
            className={`rounded-full px-6 py-3 text-lg font-bold ${
              solapa === "listos"
                ? "bg-neutral-900 text-white"
                : "border-2 border-neutral-300 bg-white text-neutral-700"
            }`}
          >
            Listos
          </button>
        </div>

        {wakeLockSoportado && (
          <label className="flex items-center gap-2 text-lg font-medium text-neutral-700">
            <input
              type="checkbox"
              checked={wakeLockActivo}
              onChange={(evento) => setWakeLockActivo(evento.target.checked)}
              className="h-7 w-7 rounded border-neutral-300"
            />
            Pantalla siempre encendida
          </label>
        )}
      </div>

      {pedidosVisibles.length === 0 ? (
        <p className="py-16 text-center text-2xl font-medium text-neutral-400">
          {solapa === "en_cocina"
            ? "No hay pedidos pendientes."
            : "No hay ítems listos todavía."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pedidosVisibles.map((pedido) => {
            const demorado = estaDemorado(pedido.creadoEn);
            return (
              <div
                key={pedido.id}
                className={`rounded-2xl border-4 p-5 ${
                  demorado
                    ? "border-red-500 bg-red-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-5xl font-black text-neutral-900">
                      #{pedido.numero ?? "—"}
                    </p>
                    <p className="mt-1 text-sm font-bold tracking-wide text-neutral-500 uppercase">
                      {pedido.mesaNombre ? "Mesa" : "Para llevar"}
                    </p>
                    {pedido.mesaNombre && (
                      <p className="text-xl font-bold text-neutral-800">
                        {pedido.mesaNombre}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {demorado && (
                      <p className="mb-1 inline-block rounded-full bg-red-600 px-3 py-1 text-sm font-black text-white">
                        DEMORADO
                      </p>
                    )}
                    <p
                      className={`text-lg font-bold ${
                        demorado ? "text-red-700" : "text-neutral-500"
                      }`}
                    >
                      {formatearTiempoAbierta(pedido.creadoEn)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {pedido.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-neutral-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xl font-bold text-neutral-900">
                            {item.cantidad}× {item.nombre}
                          </p>
                          {item.categoriaNombre && (
                            <p className="text-lg font-semibold text-neutral-500">
                              {item.categoriaNombre}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                            item.estado === "listo"
                              ? "bg-green-100 text-green-800"
                              : item.estado === "en_preparacion"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {ETIQUETA_ESTADO[item.estado]}
                        </span>
                      </div>

                      {item.adicionales.length > 0 && (
                        <p className="mt-1 text-base text-neutral-600">
                          {item.adicionales.join(", ")}
                        </p>
                      )}

                      {item.nota && (
                        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-base font-bold text-amber-900">
                          {item.nota}
                        </p>
                      )}

                      <div className="mt-3">
                        {item.estado === "listo" ? (
                          <button
                            type="button"
                            onClick={() => alRetrocederItem(item.id)}
                            className="rounded-xl border-2 border-neutral-300 px-4 py-2.5 text-base font-bold text-neutral-700 active:bg-neutral-100"
                          >
                            ← Volver a en preparación
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => alAvanzarItem(item.id)}
                            className="rounded-xl bg-neutral-900 px-5 py-3 text-base font-bold text-white active:bg-neutral-700"
                          >
                            {item.estado === "pendiente"
                              ? "Empezar →"
                              : "Marcar listo"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {solapa === "en_cocina" && (
                  <button
                    type="button"
                    onClick={() => alAvanzarPedido(pedido.id)}
                    className="mt-4 w-full rounded-2xl bg-neutral-900 px-5 py-4 text-xl font-black text-white active:bg-neutral-700"
                  >
                    Avanzar todo el pedido
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
