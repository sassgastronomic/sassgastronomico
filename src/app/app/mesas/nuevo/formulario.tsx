"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  crearMesa,
  crearMesasEnLote,
  type CampoNuevaMesa,
  type CampoNuevasMesasLote,
  type EstadoNuevaMesa,
  type EstadoNuevasMesasLote,
} from "./actions";

type ZonaOpcion = { id: string; nombre: string };

const ESTADO_INICIAL: EstadoNuevaMesa = {};
const ESTADO_INICIAL_LOTE: EstadoNuevasMesasLote = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

/**
 * Dos formularios independientes (uno por modo), cada uno con su propio
 * useActionState — mismo mecanismo que la contraseña generar/manual en
 * /app/usuarios. Solo se muestra uno a la vez; el otro no llega a montarse,
 * así que nunca se manda por accidente el que no corresponde. La zona
 * elegida se comparte entre los dos modos (mismo estado, un `<select>`
 * distinto en cada `<form>` porque tiene que viajar en el que se envía).
 */
export function FormularioNuevaMesa({ zonas }: { zonas: ZonaOpcion[] }) {
  const [modo, setModo] = useState<"varias" | "una">("varias");

  const [estado, accion, pendiente] = useActionState(crearMesa, ESTADO_INICIAL);
  const [estadoLote, accionLote, pendienteLote] = useActionState(
    crearMesasEnLote,
    ESTADO_INICIAL_LOTE,
  );

  const [nombre, setNombre] = useState(estado.valores?.nombre ?? "");
  const [zonaId, setZonaId] = useState(
    estado.valores?.zonaId ?? estadoLote.valores?.zonaId ?? zonas[0]?.id ?? "",
  );
  const [prefijo, setPrefijo] = useState(estadoLote.valores?.prefijo ?? "Mesa");
  const [desde, setDesde] = useState(estadoLote.valores?.desde ?? "1");
  const [hasta, setHasta] = useState(estadoLote.valores?.hasta ?? "");

  const refNombre = useRef<HTMLInputElement>(null);
  const refZona = useRef<HTMLSelectElement>(null);
  const refPrefijo = useRef<HTMLInputElement>(null);
  const refDesde = useRef<HTMLInputElement>(null);
  const refHasta = useRef<HTMLInputElement>(null);
  const refZonaLote = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    const refs: Record<
      CampoNuevaMesa,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      zona: refZona,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  useEffect(() => {
    if (!estadoLote.campo) return;
    const refs: Record<
      CampoNuevasMesasLote,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      prefijo: refPrefijo,
      desde: refDesde,
      hasta: refHasta,
      zona: refZonaLote,
    };
    refs[estadoLote.campo].current?.focus();
  }, [estadoLote]);

  // Solo para el texto de ayuda ("se van a crear N mesas"), no para
  // validar: eso lo hace siempre el servidor.
  const cantidad = (() => {
    const numDesde = Number(desde);
    const numHasta = Number(hasta);
    if (!Number.isInteger(numDesde) || !Number.isInteger(numHasta)) return null;
    if (numHasta < numDesde) return null;
    return numHasta - numDesde + 1;
  })();

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex gap-4 text-sm text-neutral-700">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modo === "varias"}
            onChange={() => setModo("varias")}
            className="h-4 w-4 border-neutral-300"
          />
          Varias mesas numeradas
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={modo === "una"}
            onChange={() => setModo("una")}
            className="h-4 w-4 border-neutral-300"
          />
          Una mesa
        </label>
      </div>

      {modo === "varias" ? (
        <form
          action={accionLote}
          className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label htmlFor="zona_id_lote" className={ESTILO_LABEL}>
              Zona
            </label>
            <select
              ref={refZonaLote}
              id="zona_id_lote"
              name="zona_id"
              value={zonaId}
              onChange={(evento) => setZonaId(evento.target.value)}
              className={claseInput(estadoLote.campo === "zona")}
            >
              {zonas.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {zona.nombre}
                </option>
              ))}
            </select>
            {estadoLote.campo === "zona" && (
              <p className="mt-1 text-xs text-red-600">{estadoLote.error}</p>
            )}
          </div>

          <div>
            <label htmlFor="prefijo" className={ESTILO_LABEL}>
              Prefijo
            </label>
            <input
              ref={refPrefijo}
              id="prefijo"
              name="prefijo"
              required
              value={prefijo}
              onChange={(evento) => setPrefijo(evento.target.value)}
              className={claseInput(estadoLote.campo === "prefijo")}
            />
            {estadoLote.campo === "prefijo" ? (
              <p className="mt-1 text-xs text-red-600">{estadoLote.error}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
                Ej: &quot;Mesa&quot; genera Mesa 1, Mesa 2, Mesa 3…
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="desde" className={ESTILO_LABEL}>
                Desde el número
              </label>
              <input
                ref={refDesde}
                id="desde"
                name="desde"
                type="number"
                min={1}
                required
                value={desde}
                onChange={(evento) => setDesde(evento.target.value)}
                className={claseInput(estadoLote.campo === "desde")}
              />
              {estadoLote.campo === "desde" && (
                <p className="mt-1 text-xs text-red-600">{estadoLote.error}</p>
              )}
            </div>
            <div>
              <label htmlFor="hasta" className={ESTILO_LABEL}>
                Hasta el número
              </label>
              <input
                ref={refHasta}
                id="hasta"
                name="hasta"
                type="number"
                min={1}
                required
                value={hasta}
                onChange={(evento) => setHasta(evento.target.value)}
                className={claseInput(estadoLote.campo === "hasta")}
              />
              {estadoLote.campo === "hasta" && (
                <p className="mt-1 text-xs text-red-600">{estadoLote.error}</p>
              )}
            </div>
          </div>

          {cantidad !== null && (
            <p className="text-xs text-neutral-500">
              Se {cantidad === 1 ? "va" : "van"} a crear {cantidad}{" "}
              {cantidad === 1 ? "mesa" : "mesas"}: {prefijo.trim() || "…"}{" "}
              {desde}
              {cantidad > 1 ? ` a ${prefijo.trim() || "…"} ${hasta}` : ""}.
            </p>
          )}

          {estadoLote.error && !estadoLote.campo && (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {estadoLote.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pendienteLote}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendienteLote ? "Creando…" : "Crear mesas"}
          </button>
        </form>
      ) : (
        <form
          action={accion}
          className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label htmlFor="zona_id" className={ESTILO_LABEL}>
              Zona
            </label>
            <select
              ref={refZona}
              id="zona_id"
              name="zona_id"
              value={zonaId}
              onChange={(evento) => setZonaId(evento.target.value)}
              className={claseInput(estado.campo === "zona")}
            >
              {zonas.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {zona.nombre}
                </option>
              ))}
            </select>
            {estado.campo === "zona" && (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            )}
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
            {pendiente ? "Creando…" : "Crear mesa"}
          </button>
        </form>
      )}
    </div>
  );
}
