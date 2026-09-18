"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  crearComercio,
  type CampoNuevoComercio,
  type EstadoNuevoComercio,
} from "./actions";

const ESTADO_INICIAL: EstadoNuevoComercio = {};

const ESTILO_LABEL = "mb-1 block text-sm font-medium text-neutral-700";
const ESTILO_INPUT_BASE =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1";
const ESTILO_BOTON_LINK =
  "text-xs font-medium text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline focus:underline";

// Nunca mezclar variantes (`border-neutral-300` con `border-red-400`,
// `text-neutral-900` con `text-neutral-500`, etc.) en el mismo string: con
// Tailwind, cuál gana depende del orden en que se generó el CSS, no del
// orden en el className. Por eso cada estado tiene su propio string
// completo en vez de ir agregando clases condicionales encima.
function claseInput(conError: boolean): string {
  return conError
    ? `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`
    : `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

function claseSlug(conError: boolean, deshabilitado: boolean): string {
  if (conError) {
    return `${ESTILO_INPUT_BASE} border-red-400 bg-white text-neutral-900 focus:border-red-500 focus:ring-red-500`;
  }
  if (deshabilitado) {
    // Fondo gris + texto más tenue, pero con contraste suficiente para
    // seguir siendo legible (no es un placeholder, es el slug real).
    return `${ESTILO_INPUT_BASE} cursor-not-allowed border-neutral-300 bg-neutral-100 text-neutral-500`;
  }
  return `${ESTILO_INPUT_BASE} border-neutral-300 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-900`;
}

function generarSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos (á -> a)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PaginaNuevoComercio() {
  const [estado, accion, pendiente] = useActionState(
    crearComercio,
    ESTADO_INICIAL,
  );

  // Todos los campos son controlados (salvo la contraseña, a propósito):
  // así, si la Server Action devuelve un error, lo que el usuario ya había
  // escrito no desaparece. `estado.valores` solo hace falta para el primer
  // render posterior a un submit sin JS (progressive enhancement); en el
  // resto de los casos el propio estado de React ya conserva lo tipeado.
  const [nombre, setNombre] = useState(estado.valores?.nombre ?? "");
  const [slug, setSlug] = useState(estado.valores?.slug ?? "");
  // El slug arranca deshabilitado y autogenerado a partir del nombre. Una
  // vez que el usuario pide editarlo, queda habilitado el resto de la
  // sesión del formulario (no se vuelve a deshabilitar solo).
  const [slugHabilitado, setSlugHabilitado] = useState(false);
  const [autogenerarSlug, setAutogenerarSlug] = useState(true);
  const [plan, setPlan] = useState(estado.valores?.plan ?? "take_away");
  const [limiteUsuarios, setLimiteUsuarios] = useState(
    estado.valores?.limiteUsuarios ?? "10",
  );
  const [duenioNombre, setDuenioNombre] = useState(
    estado.valores?.duenioNombre ?? "",
  );
  const [duenioEmail, setDuenioEmail] = useState(
    estado.valores?.duenioEmail ?? "",
  );

  const refNombre = useRef<HTMLInputElement>(null);
  const refSlug = useRef<HTMLInputElement>(null);
  const refPlan = useRef<HTMLSelectElement>(null);
  const refLimite = useRef<HTMLInputElement>(null);
  const refDuenioNombre = useRef<HTMLInputElement>(null);
  const refDuenioEmail = useRef<HTMLInputElement>(null);
  const refDuenioPassword = useRef<HTMLInputElement>(null);

  // Si el servidor devuelve un error de slug, el campo tiene que quedar
  // editable para poder corregirlo, así haya estado deshabilitado o no.
  // Se deriva en el render (no con un setState dentro de un efecto: React
  // desaconseja eso porque encadena renders de más) — apenas cambia
  // `estado`, este valor ya sale bien en el mismo render, sin esperar un
  // ciclo extra.
  const slugEditable = slugHabilitado || estado.campo === "slug";

  // Foco al campo que causó el error. Depende de `estado` completo (no de
  // `estado.campo`) para que también dispare si dos envíos seguidos fallan
  // por el mismo campo. Para el caso de "slug", `slugEditable` ya deja el
  // input habilitado en este mismo render, así que el foco entra bien.
  useEffect(() => {
    if (!estado.campo) return;

    const refs: Record<
      CampoNuevoComercio,
      React.RefObject<HTMLInputElement | HTMLSelectElement | null>
    > = {
      nombre: refNombre,
      slug: refSlug,
      plan: refPlan,
      limite_usuarios: refLimite,
      duenio_nombre: refDuenioNombre,
      duenio_email: refDuenioEmail,
      duenio_password: refDuenioPassword,
    };
    refs[estado.campo].current?.focus();
  }, [estado]);

  // Foco al habilitar el slug a mano con el botón "Editar slug" (evento
  // real de usuario, no efecto reaccionando a un fetch: acá sí corresponde
  // el setState de abajo, en el handler del click).
  useEffect(() => {
    if (slugHabilitado) {
      refSlug.current?.focus();
    }
  }, [slugHabilitado]);

  function alCambiarNombre(valor: string) {
    setNombre(valor);
    // Autogenerar el slug a partir del nombre, salvo que el admin ya haya
    // pedido editarlo a mano. Esto sigue aplicando aunque el campo esté
    // deshabilitado: se ve el valor generado actualizarse en vivo.
    if (autogenerarSlug) {
      setSlug(generarSlug(valor));
    }
  }

  function alCambiarSlug(valor: string) {
    // Si llegó acá es porque el campo está editable (deshabilitado no
    // dispara onChange) — lo dejamos habilitado en firme por si el usuario
    // llegó a este estado por un error de servidor en vez de por el botón.
    setSlugHabilitado(true);
    setAutogenerarSlug(false);
    setSlug(valor);
  }

  function habilitarSlug() {
    setSlugHabilitado(true);
    setAutogenerarSlug(false);
  }

  function volverAGenerarSlug() {
    setAutogenerarSlug(true);
    setSlug(generarSlug(nombre));
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Comercios
      </Link>

      <h1 className="text-xl font-semibold text-neutral-900">Crear comercio</h1>

      <form
        action={accion}
        className="max-w-xl space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-neutral-900">
            Comercio
          </legend>

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
              <label
                htmlFor="slug"
                className="block text-sm font-medium text-neutral-700"
              >
                Slug ({`/${slug || "..."}`})
              </label>
              {!slugEditable ? (
                <button
                  type="button"
                  onClick={habilitarSlug}
                  className={ESTILO_BOTON_LINK}
                >
                  Editar slug
                </button>
              ) : (
                <button
                  type="button"
                  onClick={volverAGenerarSlug}
                  className={ESTILO_BOTON_LINK}
                >
                  Volver a generar
                </button>
              )}
            </div>

            {/* El input visible puede estar disabled, y un input disabled
                no viaja en el FormData nativo. El valor real siempre se
                manda por este campo oculto, ligado al mismo estado. */}
            <input type="hidden" name="slug" value={slug} />
            <input
              ref={refSlug}
              id="slug"
              required
              pattern="[a-z0-9-]+"
              disabled={!slugEditable}
              value={slug}
              onChange={(evento) => alCambiarSlug(evento.target.value)}
              className={claseSlug(estado.campo === "slug", !slugEditable)}
            />
            {estado.campo === "slug" ? (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
                Solo minúsculas, números y guiones. Se genera solo a partir
                del nombre; “Editar slug” lo desbloquea para corregirlo a
                mano.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan" className={ESTILO_LABEL}>
                Plan
              </label>
              <select
                ref={refPlan}
                id="plan"
                name="plan"
                value={plan}
                onChange={(evento) => setPlan(evento.target.value)}
                className={claseInput(estado.campo === "plan")}
              >
                <option value="take_away">Take away</option>
                <option value="salon">Salón</option>
                <option value="completo">Completo</option>
              </select>
              {estado.campo === "plan" && (
                <p className="mt-1 text-xs text-red-600">{estado.error}</p>
              )}
            </div>

            <div>
              <label htmlFor="limite_usuarios" className={ESTILO_LABEL}>
                Límite de usuarios
              </label>
              <input
                ref={refLimite}
                id="limite_usuarios"
                name="limite_usuarios"
                type="number"
                min={1}
                required
                value={limiteUsuarios}
                onChange={(evento) => setLimiteUsuarios(evento.target.value)}
                className={claseInput(estado.campo === "limite_usuarios")}
              />
              {estado.campo === "limite_usuarios" && (
                <p className="mt-1 text-xs text-red-600">{estado.error}</p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-neutral-200 pt-4">
          <legend className="text-sm font-semibold text-neutral-900">
            Dueño
          </legend>

          <div>
            <label htmlFor="duenio_nombre" className={ESTILO_LABEL}>
              Nombre
            </label>
            <input
              ref={refDuenioNombre}
              id="duenio_nombre"
              name="duenio_nombre"
              required
              value={duenioNombre}
              onChange={(evento) => setDuenioNombre(evento.target.value)}
              className={claseInput(estado.campo === "duenio_nombre")}
            />
            {estado.campo === "duenio_nombre" && (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            )}
          </div>

          <div>
            <label htmlFor="duenio_email" className={ESTILO_LABEL}>
              Email
            </label>
            <input
              ref={refDuenioEmail}
              id="duenio_email"
              name="duenio_email"
              type="email"
              required
              value={duenioEmail}
              onChange={(evento) => setDuenioEmail(evento.target.value)}
              className={claseInput(estado.campo === "duenio_email")}
            />
            {estado.campo === "duenio_email" && (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            )}
          </div>

          <div>
            <label htmlFor="duenio_password" className={ESTILO_LABEL}>
              Contraseña
            </label>
            <input
              ref={refDuenioPassword}
              id="duenio_password"
              name="duenio_password"
              type="password"
              required
              minLength={8}
              className={claseInput(estado.campo === "duenio_password")}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Al menos 8 caracteres. El email queda confirmado automáticamente.
            </p>
            {estado.campo === "duenio_password" && (
              <p className="mt-1 text-xs text-red-600">{estado.error}</p>
            )}
            {estado.error && (
              <p className="mt-1 text-xs text-amber-600">
                Por seguridad no se guardó lo que habías escrito acá: volvé a
                cargarla.
              </p>
            )}
          </div>
        </fieldset>

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
          {pendiente ? "Creando…" : "Crear comercio"}
        </button>
      </form>
    </div>
  );
}
