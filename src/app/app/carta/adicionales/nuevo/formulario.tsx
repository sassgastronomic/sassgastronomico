"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  crearAdicional,
  type CampoNuevoAdicional,
  type EstadoNuevoAdicional,
} from "./actions";

const ESTADO_INICIAL: EstadoNuevoAdicional = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioNuevoAdicional() {
  const [estado, accion, pendiente] = useActionState(
    crearAdicional,
    ESTADO_INICIAL,
  );

  const [nombre, setNombre] = useState(estado.valores?.nombre ?? "");
  const [precioExtra, setPrecioExtra] = useState(
    estado.valores?.precioExtra ?? "0",
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refPrecio = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoNuevoAdicional,
      React.RefObject<HTMLInputElement | null>
    > = {
      nombre: refNombre,
      precio_extra: refPrecio,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  return (
    <form
      action={accion}
      className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="nombre" className={ESTILO_LABEL}>
          Nombre
        </label>
        <input
          ref={refNombre}
          id="nombre"
          name="nombre"
          required
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          className={claseInput(estado.campo === "nombre")}
        />
        {estado.campo === "nombre" && (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        )}
      </div>

      <div>
        <label htmlFor="precio_extra" className={ESTILO_LABEL}>
          Precio extra
        </label>
        <input
          ref={refPrecio}
          id="precio_extra"
          name="precio_extra"
          type="number"
          min={0}
          step="0.01"
          required
          value={precioExtra}
          onChange={(evento) => setPrecioExtra(evento.target.value)}
          className={claseInput(estado.campo === "precio_extra")}
        />
        {estado.campo === "precio_extra" ? (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">0 si es gratis.</p>
        )}
      </div>

      {estado.error && !estado.campo && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? "Creando…" : "Crear adicional"}
      </button>
    </form>
  );
}
