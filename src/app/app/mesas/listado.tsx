"use client";

import Link from "next/link";
import { useRef } from "react";

export type MesaListado = {
  id: string;
  nombre: string;
  activo: boolean;
  tieneCuentaAbierta: boolean;
};

export type ZonaConMesas = {
  id: string;
  nombre: string;
  activo: boolean;
  mesas: MesaListado[];
};

const ESTILO_BADGE_AMBAR =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-600/20";

/**
 * Cada zona es un <details> nativo (se abre/cierra clickeando el
 * <summary>, sin necesitar JS para eso). "Expandir todo"/"Contraer todo" sí
 * necesitan JS — por eso este es un Client Component — y manipulan el DOM
 * directo por ref en vez de controlar `open` por estado de React: así el
 * toggle nativo de cada <summary> nunca queda peleado con un re-render.
 * Mismo patrón que la vista previa de la carta
 * (src/app/app/carta/vista-previa.tsx): reusado, no reescrito de cero.
 */
export function ListadoMesas({ zonas }: { zonas: ZonaConMesas[] }) {
  const refLista = useRef<HTMLDivElement>(null);

  // Todas cerradas por defecto, salvo que haya una sola zona (ahí no tiene
  // sentido esconderla). Valor fijo, no estado: ver el comentario de arriba
  // sobre por qué `open` no se controla acá.
  const abiertoPorDefecto = zonas.length === 1;

  function expandirTodo() {
    refLista.current?.querySelectorAll("details").forEach((detalle) => {
      detalle.open = true;
    });
  }

  function contraerTodo() {
    refLista.current?.querySelectorAll("details").forEach((detalle) => {
      detalle.open = false;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={expandirTodo}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Expandir todo
        </button>
        <button
          type="button"
          onClick={contraerTodo}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Contraer todo
        </button>
      </div>

      <div
        ref={refLista}
        className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white shadow-sm"
      >
        {zonas.map((zona) => {
          const cuentasAbiertas = zona.mesas.filter(
            (mesa) => mesa.tieneCuentaAbierta,
          ).length;

          return (
            <details
              key={zona.id}
              open={abiertoPorDefecto}
              className={zona.activo ? "" : "opacity-60"}
            >
              <summary className="cursor-pointer select-none px-4 py-2.5 sm:px-6">
                <div className="inline-flex w-[calc(100%-1.25rem)] flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 align-middle">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-semibold text-neutral-900">
                      {zona.nombre}
                    </span>
                    {!zona.activo && (
                      <span className={ESTILO_BADGE_AMBAR}>Zona inactiva</span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {zona.mesas.length}{" "}
                    {zona.mesas.length === 1 ? "mesa" : "mesas"}
                    {cuentasAbiertas > 0 &&
                      `, ${cuentasAbiertas} con cuenta abierta`}
                  </span>
                </div>
              </summary>

              <div className="divide-y divide-neutral-100 border-t border-neutral-100 px-4 pb-2 sm:px-6">
                {zona.mesas.length === 0 ? (
                  <p className="py-2 text-sm text-neutral-400">
                    Todavía no hay mesas en esta zona.
                  </p>
                ) : (
                  zona.mesas.map((mesa) =>
                    // La zona inactiva ya desactivó (en cascada) todas sus
                    // mesas y /app/mesas/[id] rechaza editarlas mientras
                    // dure — no tiene sentido que la fila sea un link. Una
                    // mesa desactivada aparte, con su zona activa, sigue
                    // siendo editable como siempre.
                    zona.activo ? (
                      <Link
                        key={mesa.id}
                        href={`/app/mesas/${mesa.id}`}
                        className="flex items-center justify-between gap-3 py-1.5 text-sm hover:bg-neutral-50"
                      >
                        <span
                          className={
                            mesa.activo
                              ? "font-medium text-neutral-900"
                              : "font-medium text-neutral-400"
                          }
                        >
                          {mesa.nombre}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                            mesa.activo
                              ? "bg-green-50 text-green-700 ring-green-600/20"
                              : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                          }`}
                        >
                          {mesa.activo ? "Activa" : "Inactiva"}
                        </span>
                      </Link>
                    ) : (
                      <div
                        key={mesa.id}
                        className="flex items-center justify-between gap-3 py-1.5 text-sm opacity-60"
                        title="La zona está inactiva: activala para poder editar esta mesa"
                      >
                        <span className="font-medium text-neutral-400">
                          {mesa.nombre}
                        </span>
                        <span className={ESTILO_BADGE_AMBAR}>
                          Zona inactiva
                        </span>
                      </div>
                    ),
                  )
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
