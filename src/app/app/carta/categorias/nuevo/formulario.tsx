"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  crearCategoria,
  type CampoNuevaCategoria,
  type EstadoNuevaCategoria,
} from "./actions";

type SectorOpcion = { id: string; nombre: string };

const ESTADO_INICIAL: EstadoNuevaCategoria = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioNuevaCategoria({
  sectores,
}: {
  sectores: SectorOpcion[];
}) {
  const [estado, accion, pendiente] = useActionState(
    crearCategoria,
    ESTADO_INICIAL,
  );

  const [nombre, setNombre] = useState(estado.valores?.nombre ?? "");
  const [sectorId, setSectorId] = useState(
    estado.valores?.sectorId ?? sectores[0]?.id ?? "",
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refSector = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoNuevaCategoria,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      sector_id: refSector,
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
        <label htmlFor="sector_id" className={ESTILO_LABEL}>
          Sector
        </label>
        <select
          ref={refSector}
          id="sector_id"
          name="sector_id"
          value={sectorId}
          onChange={(evento) => setSectorId(evento.target.value)}
          className={claseInput(estado.campo === "sector_id")}
        >
          {sectores.map((sector) => (
            <option key={sector.id} value={sector.id}>
              {sector.nombre}
            </option>
          ))}
        </select>
        {estado.campo === "sector_id" && (
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
        {pendiente ? "Creando…" : "Crear categoría"}
      </button>
    </form>
  );
}
