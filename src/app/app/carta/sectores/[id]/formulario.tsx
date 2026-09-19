"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { Database } from "@/types/database";

import {
  actualizarSector,
  type CampoEditarSector,
  type EstadoEditarSector,
} from "./actions";

type SectorEditable = Pick<
  Database["public"]["Tables"]["sectores"]["Row"],
  "id" | "nombre" | "activo"
>;

const ESTADO_INICIAL: EstadoEditarSector = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioEditarSector({
  sector,
}: {
  sector: SectorEditable;
}) {
  const [estado, accion, pendiente] = useActionState(
    actualizarSector,
    ESTADO_INICIAL,
  );

  const [nombre, setNombre] = useState(
    estado.valores?.nombre ?? sector.nombre,
  );
  const [activo, setActivo] = useState(
    estado.valores?.activo ?? String(sector.activo),
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refActivo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoEditarSector,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      activo: refActivo,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  return (
    <form
      action={accion}
      className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="id" value={sector.id} />

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
        <label htmlFor="activo" className={ESTILO_LABEL}>
          Estado
        </label>
        <select
          ref={refActivo}
          id="activo"
          name="activo"
          value={activo}
          onChange={(evento) => setActivo(evento.target.value)}
          className={claseInput(estado.campo === "activo")}
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
        {estado.campo === "activo" && (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        )}
      </div>

      {estado.confirmacion && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-3">{estado.confirmacion}</p>
          <button
            type="submit"
            name="confirmar"
            value="true"
            disabled={pendiente}
            className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sí, desactivar de todos modos
          </button>
        </div>
      )}

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
