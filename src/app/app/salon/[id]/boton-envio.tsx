"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de submit que se deshabilita y cambia el texto mientras el
 * `<form>` que lo contiene se está enviando. Tocar dos veces igual sería
 * inofensivo (la acción solo entrega lo que sigue listo), pero sin
 * respuesta visible el mozo no sabe si el toque entró.
 */
export function BotonEnvio({
  children,
  textoPendiente,
  className,
}: {
  children: React.ReactNode;
  textoPendiente: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? textoPendiente : children}
    </button>
  );
}
