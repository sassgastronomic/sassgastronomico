"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { Database } from "@/types/database";

import {
  actualizarComercio,
  type CampoEditarComercio,
  type EstadoEditarComercio,
} from "./actions";

type ComercioEditable = Pick<
  Database["public"]["Tables"]["comercios"]["Row"],
  "id" | "nombre" | "plan" | "estado" | "limite_usuarios"
>;

const ESTADO_INICIAL: EstadoEditarComercio = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm text-neutral-900 outline-none focus:ring-1";

// Dos variantes separadas (no un string con clases condicionales encima):
// mezclar `border-neutral-300` y `border-red-400` en el mismo className deja
// el resultado a merced del orden en que Tailwind generó el CSS.
function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioEditarComercio({
  comercio,
}: {
  comercio: ComercioEditable;
}) {
  const [estado, accion, pendiente] = useActionState(
    actualizarComercio,
    ESTADO_INICIAL,
  );

  // Campos controlados: si la Server Action devuelve un error, lo que el
  // admin ya había cambiado no se pierde (un <form action={...}> resetea
  // los inputs no controlados a su valor original después de cada envío).
  const [nombre, setNombre] = useState(
    estado.valores?.nombre ?? comercio.nombre,
  );
  const [plan, setPlan] = useState(estado.valores?.plan ?? comercio.plan);
  const [estadoComercio, setEstadoComercio] = useState(
    estado.valores?.estado ?? comercio.estado,
  );
  const [limiteUsuarios, setLimiteUsuarios] = useState(
    estado.valores?.limiteUsuarios ?? String(comercio.limite_usuarios),
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refPlan = useRef<HTMLSelectElement>(null);
  const refEstado = useRef<HTMLSelectElement>(null);
  const refLimite = useRef<HTMLInputElement>(null);

  // Foco al campo que causó el error. Depende de `estado` completo (no de
  // `estado.campo`) para que también dispare si dos envíos seguidos fallan
  // por el mismo campo.
  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoEditarComercio,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      plan: refPlan,
      estado: refEstado,
      limite_usuarios: refLimite,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  return (
    <form
      action={accion}
      className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="id" value={comercio.id} />

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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="plan" className={ESTILO_LABEL}>
            Plan
          </label>
          <select
            ref={refPlan}
            id="plan"
            name="plan"
            value={plan}
            onChange={(evento) => setPlan(evento.target.value)}
            className={claseInput(estado.campo === "plan")}
          >
            <option value="take_away">Take away</option>
            <option value="salon">Salón</option>
            <option value="completo">Completo</option>
          </select>
          {estado.campo === "plan" && (
            <p className="mt-1 text-xs text-red-600">{estado.error}</p>
          )}
        </div>

        <div>
          <label htmlFor="estado" className={ESTILO_LABEL}>
            Estado
          </label>
          <select
            ref={refEstado}
            id="estado"
            name="estado"
            value={estadoComercio}
            onChange={(evento) => setEstadoComercio(evento.target.value)}
            className={claseInput(estado.campo === "estado")}
          >
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
          </select>
          {estado.campo === "estado" && (
            <p className="mt-1 text-xs text-red-600">{estado.error}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="limite_usuarios" className={ESTILO_LABEL}>
          Límite de usuarios
        </label>
        <input
          ref={refLimite}
          id="limite_usuarios"
          name="limite_usuarios"
          type="number"
          min={1}
          required
          value={limiteUsuarios}
          onChange={(evento) => setLimiteUsuarios(evento.target.value)}
          className={claseInput(estado.campo === "limite_usuarios")}
        />
        {estado.campo === "limite_usuarios" && (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
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
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
