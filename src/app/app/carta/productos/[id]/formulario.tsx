"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import type { Database } from "@/types/database";

import {
  actualizarProducto,
  type CampoEditarProducto,
  type EstadoEditarProducto,
} from "./actions";

type ProductoEditable = Pick<
  Database["public"]["Tables"]["productos"]["Row"],
  "id" | "categoria_id" | "nombre" | "descripcion" | "precio" | "activo"
>;

type CategoriaOpcion = Pick<
  Database["public"]["Tables"]["categorias"]["Row"],
  "id" | "nombre" | "activo"
> & { sectorNombre: string };

type AdicionalOpcion = Pick<
  Database["public"]["Tables"]["adicionales"]["Row"],
  "id" | "nombre" | "precio_extra"
>;

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

const ESTADO_INICIAL: EstadoEditarProducto = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioEditarProducto({
  producto,
  categorias,
  adicionales,
  adicionalesAsignadosIniciales,
}: {
  producto: ProductoEditable;
  categorias: CategoriaOpcion[];
  adicionales: AdicionalOpcion[];
  adicionalesAsignadosIniciales: string[];
}) {
  const [estado, accion, pendiente] = useActionState(
    actualizarProducto,
    ESTADO_INICIAL,
  );

  const [categoriaId, setCategoriaId] = useState(
    estado.valores?.categoriaId ?? producto.categoria_id,
  );
  const [nombre, setNombre] = useState(estado.valores?.nombre ?? producto.nombre);
  const [descripcion, setDescripcion] = useState(
    estado.valores?.descripcion ?? producto.descripcion ?? "",
  );
  const [precio, setPrecio] = useState(
    estado.valores?.precio ?? String(producto.precio),
  );
  const [activo, setActivo] = useState(
    estado.valores?.activo ?? String(producto.activo),
  );
  const [adicionalesAsignados, setAdicionalesAsignados] = useState<string[]>(
    estado.valores?.adicionalesAsignados ?? adicionalesAsignadosIniciales,
  );

  const refCategoria = useRef<HTMLSelectElement>(null);
  const refNombre = useRef<HTMLInputElement>(null);
  const refPrecio = useRef<HTMLInputElement>(null);
  const refActivo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoEditarProducto,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      categoria_id: refCategoria,
      nombre: refNombre,
      precio: refPrecio,
      activo: refActivo,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  // Se prepara en el sector de la categoría elegida: no hay forma de
  // pisarlo desde acá (decisión de negocio, ver docs/SCHEMA.md). Se
  // recalcula solo al cambiar `categoriaId`, sin efecto extra.
  const sectorDeLaCategoria =
    categorias.find((categoria) => categoria.id === categoriaId)
      ?.sectorNombre ?? "—";

  function alternarAdicional(adicionalId: string, marcado: boolean) {
    setAdicionalesAsignados((actuales) =>
      marcado
        ? [...actuales, adicionalId]
        : actuales.filter((id) => id !== adicionalId),
    );
  }

  return (
    <form
      action={accion}
      className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="id" value={producto.id} />

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
              {!categoria.activo && " (inactiva)"}
            </option>
          ))}
        </select>
        {estado.campo === "categoria_id" ? (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            Si cambiás la categoría, el producto pasa al final de la nueva.
          </p>
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

      <div className="border-t border-neutral-200 pt-4">
        <p className="mb-1 text-sm font-semibold text-neutral-900">
          Adicionales
        </p>
        <p className="mb-3 text-xs text-neutral-500">
          Cuáles ofrece este producto.
        </p>

        {adicionales.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Todavía no hay adicionales cargados.{" "}
            <Link
              href="/app/carta/adicionales"
              className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
            >
              Creá uno acá →
            </Link>
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-3">
            {adicionales.map((adicional) => (
              <label
                key={adicional.id}
                className="flex items-center gap-2 text-sm text-neutral-700"
              >
                <input
                  type="checkbox"
                  name="adicional_id"
                  value={adicional.id}
                  checked={adicionalesAsignados.includes(adicional.id)}
                  onChange={(evento) =>
                    alternarAdicional(adicional.id, evento.target.checked)
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
                {adicional.nombre}
                <span className="text-neutral-400">
                  (
                  {adicional.precio_extra === 0
                    ? "sin cargo"
                    : formateadorPrecio.format(adicional.precio_extra)}
                  )
                </span>
              </label>
            ))}
          </div>
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
