"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { Database } from "@/types/database";

import {
  actualizarCategoria,
  type CampoEditarCategoria,
  type EstadoEditarCategoria,
} from "./actions";

type CategoriaEditable = Pick<
  Database["public"]["Tables"]["categorias"]["Row"],
  "id" | "nombre" | "sector_id" | "activo"
>;

type SectorOpcion = Pick<
  Database["public"]["Tables"]["sectores"]["Row"],
  "id" | "nombre" | "activo"
>;

const ESTADO_INICIAL: EstadoEditarCategoria = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioEditarCategoria({
  categoria,
  sectores,
}: {
  categoria: CategoriaEditable;
  sectores: SectorOpcion[];
}) {
  const [estado, accion, pendiente] = useActionState(
    actualizarCategoria,
    ESTADO_INICIAL,
  );

  const [nombre, setNombre] = useState(
    estado.valores?.nombre ?? categoria.nombre,
  );
  const [sectorId, setSectorId] = useState(
    estado.valores?.sectorId ?? categoria.sector_id,
  );
  const [activo, setActivo] = useState(
    estado.valores?.activo ?? String(categoria.activo),
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refSector = useRef<HTMLSelectElement>(null);
  const refActivo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoEditarCategoria,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      sector_id: refSector,
      activo: refActivo,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  return (
    <form
      action={accion}
      className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="id" value={categoria.id} />

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
              {!sector.activo && " (inactivo)"}
            </option>
          ))}
        </select>
        {estado.campo === "sector_id" ? (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            Si cambiás el sector, los productos de esta categoría que no
            tengan un sector propio van a pasar a usar el nuevo
            automáticamente.
          </p>
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
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>
        {estado.campo === "activo" && (
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
