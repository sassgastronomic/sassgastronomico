"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// Cada cuánto se vuelve a pedir el estado mientras la pantalla está a la
// vista. Un pedido cambia de estado cada varios minutos: 10 segundos ya se
// siente "al instante" y es una consulta liviana.
const INTERVALO_MS = 10_000;

function suscribirConexion(aviso: () => void) {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
}

/**
 * Hace que el seguimiento se actualice solo, consultando cada tanto
 * (`router.refresh()`, que vuelve a armar la página en el servidor).
 *
 * Por qué no Realtime, como la cocina y el mozo: el cliente es anónimo, y
 * Realtime aplica RLS — un anónimo no recibe ningún cambio de `pedidos`.
 * Abrírselo implicaría policies para `anon` sobre pedidos ajenos, que es
 * justo lo que no tiene que pasar. Además cada pantalla abierta es una
 * conexión de Realtime, y las del plan están contadas para las pantallas
 * del local (ver docs/SCHEMA.md, "Realtime").
 *
 * Solo consulta con la pantalla a la vista, y al volver a ella (por
 * ejemplo, después de mandar el WhatsApp) consulta en el momento. Con el
 * pedido terminado (entregado o cancelado) no hace nada.
 */
export function ActualizarSeguimiento({ activo }: { activo: boolean }) {
  const router = useRouter();
  const enLinea = useSyncExternalStore(
    suscribirConexion,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    if (!activo) return;
    function refrescarSiSeVe() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const intervalo = setInterval(refrescarSiSeVe, INTERVALO_MS);
    document.addEventListener("visibilitychange", refrescarSiSeVe);
    window.addEventListener("online", refrescarSiSeVe);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", refrescarSiSeVe);
      window.removeEventListener("online", refrescarSiSeVe);
    };
  }, [activo, router]);

  if (!activo) return null;

  if (!enLinea) {
    return (
      <p className="mt-5 text-sm font-semibold">
        Sin conexión: se va a actualizar cuando vuelvas a tener internet.
      </p>
    );
  }

  return (
    <p className="mt-5 flex items-center gap-2 text-sm opacity-80">
      <span aria-hidden="true" className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      Esta pantalla se actualiza sola
    </p>
  );
}
