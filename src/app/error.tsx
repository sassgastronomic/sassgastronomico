"use client";

import { useEffect } from "react";

/**
 * Error boundary de toda la app (cubre /, /login, /admin y /app: ninguno
 * tiene un layout propio entre ellos y este archivo).
 *
 * Sin esto, si Supabase no responde (getUser(), una query a `perfiles`,
 * etc. tiran una excepción en vez de devolver `{ error }`), la ruta rompe
 * con la pantalla de error genérica de Next. Con esto se ve un mensaje en
 * español y un botón para reintentar.
 *
 * Nota: en Next.js 16 la prop para reintentar se llama `retry` (antes
 * `reset`). Ver node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Error de servidor: acá solo llega un mensaje genérico + `digest` para
    // buscarlo en los logs del servidor (Next ya lo hace así a propósito).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          Algo salió mal
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          No pudimos completar la operación. Puede ser algo temporal, probá
          de nuevo.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
