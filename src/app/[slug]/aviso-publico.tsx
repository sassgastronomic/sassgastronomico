import type { ReactNode } from "react";

import { IconoLocal } from "./iconos";

/**
 * Pantalla de "acá no hay nada para pedir" de las rutas públicas: local
 * inexistente o suspendido, sin take away, sin carta, link de seguimiento
 * vencido. Un mensaje claro en vez de un error, con la misma cara que el
 * resto de la landing.
 */
export function AvisoPublico({
  titulo,
  children,
  icono,
}: {
  titulo: string;
  children: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-neutral-50 px-6 py-16 font-sans text-neutral-900 scheme-light">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white text-neutral-700 shadow-sm ring-1 ring-neutral-200">
          {icono ?? <IconoLocal className="h-8 w-8" />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {titulo}
        </h1>
        <div className="mt-3 space-y-5 text-base leading-relaxed text-pretty text-neutral-600">
          {children}
        </div>
      </div>
    </main>
  );
}
