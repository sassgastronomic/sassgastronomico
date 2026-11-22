"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { enlaceWhatsApp, mensajeConsultaPedido } from "@/lib/landing/whatsapp";

import type { PedidoReciente } from "./almacen-local";
import { IconoChat, IconoCompartir, IconoCopiar } from "./iconos";

function sinSuscripcion() {
  return () => {};
}

/**
 * Si el chat se abre en una pestaña nueva o en la misma.
 *
 * En el celular va en la misma pestaña: el sistema le pasa el link a la
 * app y la página queda atrás tal como estaba, así que al volver el
 * cliente encuentra su link de seguimiento. En la compu se abre una
 * pestaña nueva, para no perder esta.
 *
 * Se decide *durante el render*, porque el `target` del enlace tiene que
 * estar puesto antes de que lo toquen. En el servidor y en el primer
 * render es `false` —misma pestaña, lo que corresponde en el celular— y se
 * corrige al hidratar. No se resuscribe a los cambios de viewport a
 * propósito: nadie pasa de dedo a mouse con esta pantalla abierta, y así
 * el enlace no cambia bajo el dedo.
 */
function useSeAbreEnPestanaNueva(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => !window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/**
 * Lo que ve el cliente después de confirmar el pedido (y al volver a esta
 * pantalla desde la carta). Dos cosas, en este orden:
 *
 * 1. El botón para mandarle el pedido al local por WhatsApp. El pedido ya
 *    está creado y el local lo ve en su pantalla, pero ese mensaje es el
 *    único contacto con el cliente (la landing no pide teléfono): si no
 *    llega a mandarlo, el local no tiene cómo hablarle. Es el paso que
 *    falta, así que es lo más prominente de la pantalla.
 * 2. Su link de seguimiento, para que lo guarde. También va dentro del
 *    mensaje, así que le queda en su propio chat; y si lo pierde, se lo
 *    puede pedir al local.
 *
 * El botón es un enlace de verdad, que el cliente toca: así la navegación
 * es un gesto suyo y no una redirección por código, que es lo que hace
 * que iOS pregunte antes de abrir la app. Nada de preventDefault ni
 * window.location acá.
 *
 * Si el cliente vuelve a esta pantalla después de haber mandado el
 * mensaje, el botón sigue ahí: no hay forma de saber si lo mandó, y
 * mandarlo de nuevo no confunde a nadie —arranca con el mismo número—.
 */
export function PantallaEnviado({
  slug,
  comercio,
  numero,
  pedido,
  nombreCliente,
  onVolverALaCarta,
}: {
  slug: string;
  comercio: { nombre: string; whatsapp: string };
  numero: number;
  // Lo guardado en el celular para este pedido; null si no está (otro
  // navegador, almacenamiento borrado): ahí no hay link para mostrar, y al
  // chat va un mensaje corto con el número, que alcanza para ubicarlo.
  pedido: PedidoReciente | null;
  nombreCliente: string;
  onVolverALaCarta: () => void;
}) {
  const enPestanaNueva = useSeAbreEnPestanaNueva();
  /**
   * El link al chat, armado acá —antes de que lo toquen— y puesto en el
   * href: con el número de pedido y el link de seguimiento ya dentro del
   * mensaje, que es justo lo que no existía antes de confirmar.
   *
   * Va por wa.me y no por `whatsapp://` a propósito: wa.me es un universal
   * link, así que al tocarlo con la app instalada iOS la abre sin
   * preguntar y sin pasar por la página intermedia. `whatsapp://` es un
   * esquema propio, y esos son justo los que hacen aparecer el cartel de
   * "¿Abrir en WhatsApp?". De paso wa.me es el respaldo para quien no
   * tenga la app (le abre la web), y sigue funcionando en la compu,
   * manteniendo apretado para copiar el link y sin JavaScript.
   */
  const enlaceChat = enlaceWhatsApp(
    comercio.whatsapp,
    pedido?.mensaje ??
      mensajeConsultaPedido({
        numero,
        cliente_nombre: nombreCliente || undefined,
      }),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-enviado"
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-50 font-sans text-neutral-900 scheme-light"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex-1">
          <p className="text-base font-semibold text-neutral-500">
            {comercio.nombre}
          </p>
          <h1
            id="titulo-enviado"
            className="mt-1 text-3xl leading-tight font-black tracking-tight text-balance"
          >
            Tu pedido es el #{numero}
          </h1>
          <p className="mt-3 text-lg font-semibold text-pretty text-neutral-900">
            {pedido
              ? "Falta un paso: mandáselo al local por WhatsApp."
              : "Falta un paso: avisale al local por WhatsApp."}
          </p>
          <p className="mt-1 text-base text-pretty text-neutral-600">
            Es por ahí que el local te va a contestar.
          </p>

          {/* El paso que falta, arriba de todo y lo más grande de la
              pantalla: sin este mensaje el local no tiene cómo hablarle. */}
          <a
            href={enlaceChat}
            // En la compu, pestaña nueva para no perder esta pantalla. En
            // el celular, la misma: el sistema le pasa el link a la app.
            target={enPestanaNueva ? "_blank" : undefined}
            rel={enPestanaNueva ? "noopener noreferrer" : undefined}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-6 py-5 text-xl font-bold text-white shadow-lg shadow-green-600/25 active:bg-green-700"
          >
            <IconoChat className="h-7 w-7 shrink-0" />
            {pedido ? "Enviá tu pedido por WhatsApp" : "Escribile al local"}
          </a>
          <p className="mt-3 text-base text-pretty text-neutral-600">
            {pedido
              ? "Se abre el chat del local con tu pedido ya escrito: solo tenés que apretar enviar."
              : `Se abre el chat del local: contale que hiciste el pedido #${numero}.`}
          </p>

          {pedido ? (
            <section className="mt-9 rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
              <h2 className="text-lg font-bold">Guardá este link</h2>
              <p className="mt-1 text-base text-pretty text-neutral-600">
                Con él ves cómo va tu pedido: cuándo lo aceptan y cuándo
                está listo.
              </p>
              <p className="mt-3 rounded-xl bg-neutral-100 px-3 py-2.5 font-mono text-sm break-all text-neutral-700 select-all">
                {pedido.link}
              </p>
              <BotonesLink link={pedido.link} numero={numero} />
              <Link
                href={`/${slug}/pedido/${pedido.codigo}`}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-neutral-900 ring-1 ring-neutral-300 active:bg-neutral-100"
              >
                Ver cómo va mi pedido
                <span aria-hidden="true">→</span>
              </Link>
              <p className="mt-4 text-sm text-pretty text-neutral-600">
                Si lo perdés, pedíselo al local por WhatsApp. También va en
                el mensaje que le mandás.
              </p>
            </section>
          ) : (
            <p className="mt-9 rounded-2xl bg-white p-5 text-base text-pretty text-neutral-600 ring-1 ring-neutral-200">
              Si no tenés el link para seguir tu pedido, pedíselo al local
              por WhatsApp.
            </p>
          )}
        </div>

        <div className="mt-10">
          <button
            type="button"
            onClick={onVolverALaCarta}
            className="w-full rounded-2xl bg-white px-6 py-4 text-lg font-semibold text-neutral-900 ring-1 ring-neutral-200 active:bg-neutral-100"
          >
            Volver a la carta
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Copiar el link (y "Compartir", donde el celular lo permite: así se lo
 * puede mandar a sí mismo o guardarlo en notas). Ni el portapapeles ni
 * compartir existen fuera de https: ahí "Copiar" cae en un cuadro con el
 * link seleccionable.
 */
function BotonesLink({ link, numero }: { link: string; numero: number }) {
  const [copiado, setCopiado] = useState(false);
  const puedeCompartir = useSyncExternalStore(
    sinSuscripcion,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copiá este link para seguir tu pedido:", link);
    }
  }

  async function compartir() {
    try {
      await navigator.share({ title: `Mi pedido #${numero}`, url: link });
    } catch {
      // Cerró el menú de compartir sin elegir nada: no pasa nada.
    }
  }

  const estiloBoton =
    "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold";

  return (
    <div className={`mt-3 grid gap-2 ${puedeCompartir ? "grid-cols-2" : ""}`}>
      <button
        type="button"
        onClick={copiar}
        className={`${estiloBoton} bg-neutral-900 text-white active:bg-neutral-700`}
      >
        <IconoCopiar className="h-5 w-5 shrink-0" />
        <span aria-live="polite">{copiado ? "¡Copiado!" : "Copiar link"}</span>
      </button>
      {puedeCompartir && (
        <button
          type="button"
          onClick={compartir}
          className={`${estiloBoton} bg-neutral-100 text-neutral-900 active:bg-neutral-200`}
        >
          <IconoCompartir className="h-5 w-5 shrink-0" />
          Compartir
        </button>
      )}
    </div>
  );
}
