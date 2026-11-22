"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { suscribirseConSesion } from "@/lib/supabase/realtime";

/**
 * Tiempo real de las pantallas de disponibilidad (sector y mostrador):
 *
 * - `productos`, `categorias` y `sectores` del comercio: otra tablet, el
 *   mostrador o el dueño marcan algo (o cambian la carta) → se vuelve a
 *   pedir la página (`router.refresh()`), mismo criterio que el resto: no
 *   se mezcla el payload a mano.
 * - Pedidos nuevos: mientras alguien está acá no está mirando los pedidos,
 *   así que si entra uno se avisa, con un link para volver. En un sector,
 *   lo mismo que dispara el "Pedido nuevo" de su pantalla (un ítem nuevo
 *   del sector, o un pedido online que el mostrador aceptó); en el
 *   mostrador, un pedido nuevo de la landing.
 */
export function DisponibilidadEnVivo({
  comercioId,
  sectorId,
  hrefPedidos,
}: {
  comercioId: string;
  // null: la del mostrador (todos los sectores).
  sectorId: string | null;
  hrefPedidos: string;
}) {
  const router = useRouter();
  const [conectado, setConectado] = useState(true);
  const [pedidoNuevo, setPedidoNuevo] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    // Varios cambios casi juntos (marcar unos cuantos seguidos): un solo
    // refresco.
    function programarRefresco() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => router.refresh(), 400);
    }

    const desuscribirse = suscribirseConSesion((supabase) => {
      let canal = supabase.channel(
        `disponibilidad-${comercioId}-${sectorId ?? "mostrador"}`,
      );
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

      if (sectorId) {
        canal = canal
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "pedido_items",
              filter: `sector_id=eq.${sectorId}`,
            },
            () => setPedidoNuevo(true),
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "pedidos",
              filter: `comercio_id=eq.${comercioId}`,
            },
            (payload) => {
              const fila = payload.new;
              if ("estado" in fila && fila.estado === "confirmado") {
                setPedidoNuevo(true);
              }
            },
          );
      } else {
        canal = canal.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "pedidos",
            filter: `comercio_id=eq.${comercioId}`,
          },
          (payload) => {
            const fila = payload.new;
            if ("origen" in fila && fila.origen === "landing") {
              setPedidoNuevo(true);
            }
          },
        );
      }

      return canal.subscribe((estado) => {
        setConectado(estado === "SUBSCRIBED");
        // Al reconectar, el estado real (lo que cambió mientras tanto).
        if (estado === "SUBSCRIBED") programarRefresco();
      });
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      desuscribirse();
    };
  }, [comercioId, sectorId, router]);

  return (
    <>
      {!conectado && (
        <p className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg font-bold text-amber-800">
          Reconectando… lo que ves puede no estar al día.
        </p>
      )}
      {pedidoNuevo && (
        <Link
          href={hrefPedidos}
          className="flex items-center justify-between gap-3 rounded-2xl border-4 border-blue-500 bg-blue-50 px-4 py-3 text-xl font-black text-blue-800 active:bg-blue-100"
        >
          <span className="animate-pulse motion-reduce:animate-none">
            Entró un pedido nuevo
          </span>
          <span className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-base font-bold text-white">
            Ver pedidos
          </span>
        </Link>
      )}
    </>
  );
}
