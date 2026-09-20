"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { RolAsignable } from "@/lib/usuarios/validacion";

import {
  actualizarUsuario,
  resetearPassword,
  type CampoEditarUsuario,
  type EstadoEditarUsuario,
  type EstadoResetearPassword,
} from "./actions";

type MiembroEditable = {
  id: string;
  rol: RolAsignable;
  activo: boolean;
  nombre: string;
  usuario: string | null;
};

type SectorOpcion = { id: string; nombre: string; activo: boolean };

const ESTADO_INICIAL: EstadoEditarUsuario = {};
const ESTADO_INICIAL_PASSWORD: EstadoResetearPassword = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

const ETIQUETA_ROL: Record<RolAsignable, string> = {
  mostrador: "Mostrador",
  mozo: "Mozo",
  sector: "Sector",
};

export function FormularioEditarUsuario({
  miembro,
  sectores,
  sectorIdsAsignados,
  permiteMozo,
}: {
  miembro: MiembroEditable;
  sectores: SectorOpcion[];
  sectorIdsAsignados: string[];
  permiteMozo: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    actualizarUsuario,
    ESTADO_INICIAL,
  );
  const [estadoPassword, accionPassword, pendientePassword] = useActionState(
    resetearPassword,
    ESTADO_INICIAL_PASSWORD,
  );

  const [nombre, setNombre] = useState(estado.valores?.nombre ?? miembro.nombre);
  const [rol, setRol] = useState<string>(estado.valores?.rol ?? miembro.rol);
  const [sectorIds, setSectorIds] = useState<string[]>(
    estado.valores?.sectorIds ?? sectorIdsAsignados,
  );
  const [activo, setActivo] = useState(
    estado.valores?.activo ?? String(miembro.activo),
  );
  const [modoPasswordReset, setModoPasswordReset] = useState("generar");
  const [passwordReset, setPasswordReset] = useState("");

  const refNombre = useRef<HTMLInputElement>(null);
  const refRol = useRef<HTMLSelectElement>(null);
  const refSectores = useRef<HTMLDivElement>(null);
  const refActivo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!estado.campo) return;
    if (estado.campo === "sectores") {
      refSectores.current?.focus();
      return;
    }
    const refs: Record<
      Exclude<CampoEditarUsuario, "sectores">,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      rol: refRol,
      activo: refActivo,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  function alternarSector(sectorId: string, marcado: boolean) {
    setSectorIds((actuales) =>
      marcado ? [...actuales, sectorId] : actuales.filter((id) => id !== sectorId),
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <form
        action={accion}
        className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={miembro.id} />

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
          <p className={ESTILO_LABEL}>Nombre de usuario</p>
          <p className="text-sm text-neutral-500">
            {miembro.usuario ?? "—"} (no se puede cambiar una vez creado)
          </p>
        </div>

        <div>
          <label htmlFor="rol" className={ESTILO_LABEL}>
            Rol
          </label>
          <select
            ref={refRol}
            id="rol"
            name="rol"
            value={rol}
            onChange={(evento) => setRol(evento.target.value)}
            className={claseInput(estado.campo === "rol")}
          >
            {(Object.keys(ETIQUETA_ROL) as RolAsignable[]).map((valor) => (
              <option
                key={valor}
                value={valor}
                disabled={valor === "mozo" && !permiteMozo}
              >
                {ETIQUETA_ROL[valor]}
                {valor === "mozo" && !permiteMozo
                  ? " (necesita plan salón o completo)"
                  : ""}
              </option>
            ))}
          </select>
          {estado.campo === "rol" && (
            <p className="mt-1 text-xs text-red-600">{estado.error}</p>
          )}
        </div>

        {rol === "sector" && (
          <div>
            <p className={ESTILO_LABEL}>Sectores</p>
            {sectores.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No hay sectores cargados.
              </p>
            ) : (
              <div
                ref={refSectores}
                tabIndex={-1}
                className="space-y-1 rounded-md border border-neutral-200 p-3"
              >
                {sectores.map((sector) => (
                  <label
                    key={sector.id}
                    className="flex items-center gap-2 text-sm text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      name="sector_id"
                      value={sector.id}
                      checked={sectorIds.includes(sector.id)}
                      onChange={(evento) =>
                        alternarSector(sector.id, evento.target.checked)
                      }
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    {sector.nombre}
                    {!sector.activo && " (inactivo)"}
                  </label>
                ))}
              </div>
            )}
            {estado.campo === "sectores" && (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            )}
          </div>
        )}

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

      <form
        action={accionPassword}
        className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={miembro.id} />
        <p className="text-sm font-semibold text-neutral-900">Contraseña</p>

        {estadoPassword.passwordGenerada && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="mb-1 font-medium">Nueva contraseña generada</p>
            <p className="select-all font-mono text-base tracking-wide">
              {estadoPassword.passwordGenerada}
            </p>
            <p className="mt-2 text-xs text-amber-700">
              Copiala ahora: no se vuelve a mostrar.
            </p>
          </div>
        )}
        {estadoPassword.actualizada && (
          <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Contraseña actualizada.
          </p>
        )}

        {/* El selector queda siempre visible, no solo antes del primer
            reseteo: si desapareciera después de generar/actualizar, un
            segundo reseteo en la misma carga de página se quedaría sin
            `modo_password` que mandar. */}
        <div className="flex flex-wrap gap-4 text-sm text-neutral-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo_password"
              value="generar"
              checked={modoPasswordReset === "generar"}
              onChange={() => setModoPasswordReset("generar")}
              className="h-4 w-4 border-neutral-300"
            />
            Generarla automáticamente
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo_password"
              value="manual"
              checked={modoPasswordReset === "manual"}
              onChange={() => setModoPasswordReset("manual")}
              className="h-4 w-4 border-neutral-300"
            />
            Escribirla yo
          </label>
        </div>

        {modoPasswordReset === "generar" ? (
          <p className="text-xs text-neutral-500">
            Se muestra una sola vez después de resetear.
          </p>
        ) : (
          <div>
            <input
              id="password_reset"
              name="password"
              type="password"
              required
              minLength={6}
              value={passwordReset}
              onChange={(evento) => setPasswordReset(evento.target.value)}
              className={claseInput(estadoPassword.campo === "password")}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Al menos 6 caracteres.
            </p>
          </div>
        )}

        {estadoPassword.error && (
          <p role="alert" className="text-sm text-red-700">
            {estadoPassword.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pendientePassword}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendientePassword ? "Guardando…" : "Resetear contraseña"}
        </button>
      </form>
    </div>
  );
}
