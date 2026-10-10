"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { suscribirseConSesion } from "@/lib/supabase/realtime";

/**
 * Tiempo real de las pantallas del mozo (/app/salon y /app/salon/[id]).
 * Escucha dos tablas del comercio:
 *
 * - `pedido_items`: cocina marca algo listo, otro mozo carga o entrega →
 *   se vuelve a pedir la página al servidor con `router.refresh()`.
 * - `cuentas`: otro mozo abre o cierra una mesa → lo mismo, salvo un caso:
 *   si se cerró la cuenta que esta pantalla está mostrando (`cuentaId`),
 *   se tapa todo con un aviso y se deja de refrescar. No hay nada más que
 *   hacer sobre esa mesa, y las acciones igual lo rechazarían en el
 *   servidor.
 *
 * No se mezcla el payload a mano: se trae el estado real, y al reconectar
 * también. `router.refresh()` conserva el estado de los Client Components
 * (el carrito a medio armar no se pierde).
 */
export function ActualizarEnVivo({
  comercioId,
  cuentaId,
  escucharCarta = false,
}: {
  comercioId: string;
  cuentaId?: string;
  // Solo la carga de pedidos: si el dueño apaga un producto, su categoría
  // o su sector, la carta del mozo deja de ofrecerlo sin recargar.
  escucharCarta?: boolean;
}) {
  const router = useRouter();
  const [conectado, setConectado] = useState(true);
  const [cuentaCerrada, setCuentaCerrada] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cerrada = false;

    // Una ronda o un "entregar todo" son varios ítems casi juntos: un solo
    // refresco para todos.
    function programarRefresco() {
      if (cerrada) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => router.refresh(), 400);
    }

    const desuscribirse = suscribirseConSesion((supabase) => {
      let canal = supabase
        .channel(`salon-${comercioId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pedido_items",
            filter: `comercio_id=eq.${comercioId}`,
          },
          programarRefresco,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cuentas",
            filter: `comercio_id=eq.${comercioId}`,
          },
          (payload) => {
            const fila = payload.new;
            if (
              cuentaId &&
              "id" in fila &&
              fila.id === cuentaId &&
              "estado" in fila &&
              fila.estado === "cerrada"
            ) {
              cerrada = true;
              if (timeoutId) clearTimeout(timeoutId);
              setCuentaCerrada(true);
              return;
            }
            programarRefresco();
          },
        );

      // Las tres tablas de las que depende la disponibilidad efectiva (ver
      // docs/SCHEMA.md). La página vuelve a pedir `carta_publica` al
      // refrescar, así que no hace falta mirar qué cambió.
      if (escucharCarta) {
        for (const tabla of ["productos", "categorias", "sectores"] as const) {
          canal = canal.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: tabla,
              filter: `comercio_id=eq.${comercioId}`,
            },
            programarRefresco,
          );
        }
      }

      return canal.subscribe((estado) => {
        setConectado(estado === "SUBSCRIBED");
        if (estado === "SUBSCRIBED") {
          programarRefresco();
        }
      });
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      desuscribirse();
    };
  }, [comercioId, cuentaId, escucharCarta, router]);

  if (cuentaCerrada) {
    return (
      <div
        role="alertdialog"
        className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-6 bg-white px-6 text-center"
      >
        <p className="text-3xl font-black text-neutral-900">
          Esta mesa se cerró
        </p>
        <p className="text-lg text-neutral-600">
          La cuenta ya está cerrada: no se le puede cargar ni entregar nada.
        </p>
        <Link
          href="/app/salon"
          className="w-full max-w-sm rounded-2xl bg-neutral-900 px-5 py-5 text-xl font-bold text-white active:bg-neutral-700"
        >
          Volver a las mesas
        </Link>
      </div>
    );
  }

  if (conectado) return null;

  return (
    <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-base font-bold text-amber-800">
      Reconectando… lo que veas puede no estar al día.
    </p>
  );
}
