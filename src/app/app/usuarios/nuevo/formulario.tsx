"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import type { RolAsignable } from "@/lib/usuarios/validacion";

import {
  crearUsuario,
  type CampoNuevoUsuario,
  type EstadoNuevoUsuario,
} from "./actions";

type SectorOpcion = { id: string; nombre: string };

const ESTADO_INICIAL: EstadoNuevoUsuario = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";
const ESTILO_BOTON_LINK =
  "text-xs font-medium text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline focus:underline";

function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

function claseUsuario(conError: boolean, deshabilitado: boolean): string {
  if (conError) {
    return `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`;
  }
  if (deshabilitado) {
    return `${ESTILO_INPUT_BASE} cursor-not-allowed border-neutral-300 bg-neutral-100 text-neutral-500`;
  }
  return `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

const ETIQUETA_ROL: Record<RolAsignable, string> = {
  mostrador: "Mostrador",
  mozo: "Mozo",
  sector: "Sector",
};

// Sugerencia a partir del nombre de la persona y el slug del comercio (ej.
// "Juan Pérez" en bar-demo -> juan.bardemo). Solo un punto de partida: el
// campo queda editable, y el servidor es quien valida de verdad.
function normalizarParaUsuario(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos (á -> a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sugerirUsuario(nombre: string, comercioSlug: string): string {
  const primerNombre = normalizarParaUsuario(nombre.trim().split(/\s+/)[0] ?? "");
  const comercio = normalizarParaUsuario(comercioSlug);
  const partes = [primerNombre, comercio].filter((parte) => parte.length > 0);
  return partes.join(".").slice(0, 30);
}

export function FormularioNuevoUsuario({
  sectores,
  permiteMozo,
  comercioSlug,
}: {
  sectores: SectorOpcion[];
  permiteMozo: boolean;
  comercioSlug: string;
}) {
  const [estado, accion, pendiente] = useActionState(crearUsuario, ESTADO_INICIAL);

  const [nombre, setNombre] = useState(estado.valores?.nombre ?? "");
  const [usuario, setUsuario] = useState(estado.valores?.usuario ?? "");
  // Mismo mecanismo que el slug en /admin/comercios/nuevo: arranca
  // autogenerado a partir del nombre, y una vez que el dueño pide editarlo
  // queda habilitado el resto de la sesión del formulario.
  const [usuarioHabilitado, setUsuarioHabilitado] = useState(false);
  const [autogenerarUsuario, setAutogenerarUsuario] = useState(true);
  const [modoPassword, setModoPassword] = useState(
    estado.valores?.modoPassword ?? "generar",
  );
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<string>(estado.valores?.rol ?? "mostrador");
  const [sectorIds, setSectorIds] = useState<string[]>(
    estado.valores?.sectorIds ?? [],
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refUsuario = useRef<HTMLInputElement>(null);
  const refPassword = useRef<HTMLInputElement>(null);
  const refRol = useRef<HTMLSelectElement>(null);
  const refSectores = useRef<HTMLDivElement>(null);

  const usuarioEditable = usuarioHabilitado || estado.campo === "usuario";

  useEffect(() => {
    if (!estado.campo) return;
    if (estado.campo === "sectores") {
      refSectores.current?.focus();
      return;
    }
    const refs: Record<
      Exclude<CampoNuevoUsuario, "sectores">,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      usuario: refUsuario,
      password: refPassword,
      rol: refRol,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  useEffect(() => {
    if (usuarioHabilitado) {
      refUsuario.current?.focus();
    }
  }, [usuarioHabilitado]);

  function alCambiarNombre(valor: string) {
    setNombre(valor);
    if (autogenerarUsuario) {
      setUsuario(sugerirUsuario(valor, comercioSlug));
    }
  }

  function alCambiarUsuario(valor: string) {
    setUsuarioHabilitado(true);
    setAutogenerarUsuario(false);
    setUsuario(valor);
  }

  function habilitarUsuario() {
    setUsuarioHabilitado(true);
    setAutogenerarUsuario(false);
  }

  function volverAGenerarUsuario() {
    setAutogenerarUsuario(true);
    setUsuario(sugerirUsuario(nombre, comercioSlug));
  }

  function usarSugerencia(sugerencia: string) {
    setUsuarioHabilitado(true);
    setAutogenerarUsuario(false);
    setUsuario(sugerencia);
  }

  function alternarSector(sectorId: string, marcado: boolean) {
    setSectorIds((actuales) =>
      marcado ? [...actuales, sectorId] : actuales.filter((id) => id !== sectorId),
    );
  }

  // Ya se creó y la contraseña la generó el sistema: se muestra una sola
  // vez acá, no hay redirect automático (ver ./actions.ts). Reemplaza al
  // formulario entero: no tiene sentido dejarlo para "crear otro" por
  // error de doble clic.
  if (estado.creado) {
    return (
      <div className="max-w-xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-neutral-900">
          Usuario creado
        </p>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-1">
            Usuario:{" "}
            <span className="font-mono font-medium">
              {estado.creado.usuario}
            </span>
          </p>
          <p>
            Contraseña:{" "}
            <span className="select-all font-mono text-base tracking-wide">
              {estado.creado.passwordGenerada}
            </span>
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Copiala ahora y pasásela al empleado: no se vuelve a mostrar.
          </p>
        </div>
        <Link
          href="/app/usuarios"
          className="inline-block rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

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
          onChange={(evento) => alCambiarNombre(evento.target.value)}
          className={claseInput(estado.campo === "nombre")}
        />
        {estado.campo === "nombre" && (
          <p className="mt-1 text-xs text-red-600">{estado.error}</p>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="usuario" className="block text-sm font-medium text-neutral-700">
            Nombre de usuario
          </label>
          {!usuarioEditable ? (
            <button type="button" onClick={habilitarUsuario} className={ESTILO_BOTON_LINK}>
              Editar
            </button>
          ) : (
            <button type="button" onClick={volverAGenerarUsuario} className={ESTILO_BOTON_LINK}>
              Volver a generar
            </button>
          )}
        </div>

        {/* El input visible puede estar disabled, y un input disabled no
            viaja en el FormData nativo. El valor real siempre se manda por
            este campo oculto, ligado al mismo estado. */}
        <input type="hidden" name="usuario" value={usuario} />
        <input
          ref={refUsuario}
          id="usuario"
          disabled={!usuarioEditable}
          value={usuario}
          onChange={(evento) => alCambiarUsuario(evento.target.value)}
          className={claseUsuario(estado.campo === "usuario", !usuarioEditable)}
        />
        {estado.campo === "usuario" ? (
          <>
            <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            {estado.sugerenciaUsuario && (
              <button
                type="button"
                onClick={() => usarSugerencia(estado.sugerenciaUsuario!)}
                className={`mt-1 ${ESTILO_BOTON_LINK}`}
              >
                Usar &quot;{estado.sugerenciaUsuario}&quot; en su lugar
              </button>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            Con esto entra al sistema, sin email. Solo minúsculas, números,
            puntos y guiones bajos. No se puede cambiar después.
          </p>
        )}
      </div>

      <div>
        <p className={ESTILO_LABEL}>Contraseña</p>
        <div className="flex flex-wrap gap-4 text-sm text-neutral-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo_password"
              value="generar"
              checked={modoPassword === "generar"}
              onChange={() => setModoPassword("generar")}
              className="h-4 w-4 border-neutral-300"
            />
            Generarla automáticamente
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo_password"
              value="manual"
              checked={modoPassword === "manual"}
              onChange={() => setModoPassword("manual")}
              className="h-4 w-4 border-neutral-300"
            />
            Escribirla yo
          </label>
        </div>

        {modoPassword === "generar" ? (
          <p className="mt-1 text-xs text-neutral-500">
            Se muestra una sola vez después de crear el usuario.
          </p>
        ) : (
          <div className="mt-2">
            <input
              ref={refPassword}
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
              className={claseInput(estado.campo === "password")}
            />
            {estado.campo === "password" ? (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
                Al menos 6 caracteres.
              </p>
            )}
          </div>
        )}
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
            <option key={valor} value={valor} disabled={valor === "mozo" && !permiteMozo}>
              {ETIQUETA_ROL[valor]}
              {valor === "mozo" && !permiteMozo ? " (necesita plan salón o completo)" : ""}
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
              No hay sectores activos para asignar.
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
                </label>
              ))}
            </div>
          )}
          {estado.campo === "sectores" && (
            <p className="mt-1 text-xs text-red-600">{estado.error}</p>
          )}
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
        {pendiente ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}
