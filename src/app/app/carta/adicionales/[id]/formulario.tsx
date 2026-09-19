"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { Database } from "@/types/database";

import {
  actualizarAdicional,
  type CampoEditarAdicional,
  type EstadoEditarAdicional,
} from "./actions";

type AdicionalEditable = Pick<
  Database["public"]["Tables"]["adicionales"]["Row"],
  "id" | "nombre" | "precio_extra" | "activo"
>;

type ProductoOpcion = {
  id: string;
  nombre: string;
};

type CategoriaConProductos = {
  id: string;
  nombre: string;
  productos: ProductoOpcion[];
};

const ESTADO_INICIAL: EstadoEditarAdicional = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

export function FormularioEditarAdicional({
  adicional,
  categorias,
  productosAsignadosIniciales,
}: {
  adicional: AdicionalEditable;
  categorias: CategoriaConProductos[];
  productosAsignadosIniciales: string[];
}) {
  const [estado, accion, pendiente] = useActionState(
    actualizarAdicional,
    ESTADO_INICIAL,
  );

  const [nombre, setNombre] = useState(
    estado.valores?.nombre ?? adicional.nombre,
  );
  const [precioExtra, setPrecioExtra] = useState(
    estado.valores?.precioExtra ?? String(adicional.precio_extra),
  );
  const [activo, setActivo] = useState(
    estado.valores?.activo ?? String(adicional.activo),
  );
  const [productosAsignados, setProductosAsignados] = useState<string[]>(
    estado.valores?.productosAsignados ?? productosAsignadosIniciales,
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refPrecio = useRef<HTMLInputElement>(null);
  const refActivo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoEditarAdicional,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      precio_extra: refPrecio,
      activo: refActivo,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  function alternarProducto(productoId: string, marcado: boolean) {
    setProductosAsignados((actuales) =>
      marcado
        ? [...actuales, productoId]
        : actuales.filter((id) => id !== productoId),
    );
  }

  const hayProductos = categorias.some(
    (categoria) => categoria.productos.length > 0,
  );

  return (
    <form
      action={accion}
      className="max-w-xl space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="id" value={adicional.id} />

      <div className="space-y-4">
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
        </div>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <p className="mb-1 text-sm font-semibold text-neutral-900">
          Productos
        </p>
        <p className="mb-3 text-xs text-neutral-500">
          A qué productos se les ofrece este adicional.
        </p>

        {!hayProductos ? (
          <p className="text-sm text-neutral-500">
            Todavía no hay productos activos cargados.
          </p>
        ) : (
          <div className="max-h-80 space-y-4 overflow-y-auto rounded-md border border-neutral-200 p-3">
            {categorias.map(
              (categoria) =>
                categoria.productos.length > 0 && (
                  <div key={categoria.id}>
                    <p className="mb-1 text-xs font-semibold text-neutral-500">
                      {categoria.nombre}
                    </p>
                    <div className="space-y-1">
                      {categoria.productos.map((producto) => (
                        <label
                          key={producto.id}
                          className="flex items-center gap-2 text-sm text-neutral-700"
                        >
                          <input
                            type="checkbox"
                            name="producto_id"
                            value={producto.id}
                            checked={productosAsignados.includes(producto.id)}
                            onChange={(evento) =>
                              alternarProducto(producto.id, evento.target.checked)
                            }
                            className="h-4 w-4 rounded border-neutral-300"
                          />
                          {producto.nombre}
                        </label>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
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
