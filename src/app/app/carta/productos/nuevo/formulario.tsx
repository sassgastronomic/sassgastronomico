"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  crearProducto,
  type CampoNuevoProducto,
  type EstadoNuevoProducto,
} from "./actions";

type CategoriaOpcion = { id: string; nombre: string; sectorNombre: string };

const ESTADO_INICIAL: EstadoNuevoProducto = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioNuevoProducto({
  categorias,
  categoriaPreseleccionada,
}: {
  categorias: CategoriaOpcion[];
  categoriaPreseleccionada: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    crearProducto,
    ESTADO_INICIAL,
  );

  const [categoriaId, setCategoriaId] = useState(
    estado.valores?.categoriaId ?? categoriaPreseleccionada,
  );
  const [nombre, setNombre] = useState(estado.valores?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(
    estado.valores?.descripcion ?? "",
  );
  const [precio, setPrecio] = useState(estado.valores?.precio ?? "");

  const refCategoria = useRef<HTMLSelectElement>(null);
  const refNombre = useRef<HTMLInputElement>(null);
  const refPrecio = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoNuevoProducto,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      categoria_id: refCategoria,
      nombre: refNombre,
      precio: refPrecio,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  // Se prepara en el sector de la categoría elegida: no hay forma de
  // pisarlo desde acá (decisión de negocio, ver docs/SCHEMA.md). Se
  // recalcula solo al cambiar `categoriaId`, sin efecto extra.
  const sectorDeLaCategoria =
    categorias.find((categoria) => categoria.id === categoriaId)
      ?.sectorNombre ?? "—";

  return (
    <form
      action={accion}
      className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="categoria_id" className={ESTILO_LABEL}>
          Categoría
        </label>
        <select
          ref={refCategoria}
          id="categoria_id"
          name="categoria_id"
          value={categoriaId}
          onChange={(evento) => setCategoriaId(evento.target.value)}
          className={claseInput(estado.campo === "categoria_id")}
        >
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </select>
        {estado.campo === "categoria_id" && (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          Se prepara en: {sectorDeLaCategoria}
        </p>
      </div>

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
        <label htmlFor="descripcion" className={ESTILO_LABEL}>
          Descripción (opcional)
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          rows={2}
          value={descripcion}
          onChange={(evento) => setDescripcion(evento.target.value)}
          className={claseInput(false)}
        />
      </div>

      <div>
        <label htmlFor="precio" className={ESTILO_LABEL}>
          Precio
        </label>
        <input
          ref={refPrecio}
          id="precio"
          name="precio"
          type="number"
          min={0}
          step="0.01"
          required
          value={precio}
          onChange={(evento) => setPrecio(evento.target.value)}
          className={claseInput(estado.campo === "precio")}
        />
        {estado.campo === "precio" && (
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
        {pendiente ? "Creando…" : "Crear producto"}
      </button>
    </form>
  );
}
