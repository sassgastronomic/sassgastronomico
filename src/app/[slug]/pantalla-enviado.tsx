"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { enlaceWhatsApp, mensajeConsultaPedido } from "@/lib/landing/whatsapp";

import type { PedidoReciente } from "./almacen-local";
import { IconoChat, IconoCompartir, IconoCopiar } from "./iconos";

// Qué pasó al intentar abrir WhatsApp: `null` si no hubo intento en esta
// visita (por ejemplo, se volvió a esta pantalla desde la carta).
export type EstadoWhatsapp = "abriendo" | "abierto" | "sin-abrir" | null;

function sinSuscripcion() {
  return () => {};
}

/**
 * Lo que ve el cliente después de enviar el pedido (y al volver de
 * WhatsApp): su link de seguimiento, para que lo guarde, y que si lo
 * pierde se lo pida al local por WhatsApp. El link también va en el
 * mensaje que le mandó al local, así que queda en su propio chat.
 *
 * El mensaje con el pedido es además el único contacto con el cliente (la
 * landing no pide teléfono): si no llegó a mandarlo, el local no tiene
 * cómo hablarle. Por eso "Ir al chat del local" abre el chat con el
 * pedido escrito otra vez — si ya lo había mandado, mandarlo de nuevo no
 * confunde a nadie: arranca con el mismo número.
 */
export function PantallaEnviado({
  slug,
  comercio,
  numero,
  pedido,
  nombreCliente,
  estadoWhatsapp,
  onAbrirChat,
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
  estadoWhatsapp: EstadoWhatsapp;
  // Recibe el mensaje; la landing elige el link (app directa o wa.me).
  onAbrirChat: (mensaje: string) => void;
  onVolverALaCarta: () => void;
}) {
  const mensajeChat =
    pedido?.mensaje ??
    mensajeConsultaPedido({
      numero,
      cliente_nombre: nombreCliente || undefined,
    });
  // El href queda en wa.me (funciona siempre, también al mantener apretado
  // o sin JavaScript); el toque normal lo maneja la landing.
  const enlaceChat = enlaceWhatsApp(comercio.whatsapp, mensajeChat);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-enviado"
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-50 font-sans text-neutral-900 scheme-light"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex-1">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
            <IconoChat className="h-8 w-8" />
          </div>
          <p className="mt-6 text-base font-semibold text-neutral-500">
            {comercio.nombre}
          </p>
          <h1
            id="titulo-enviado"
            className="mt-1 text-3xl leading-tight font-black tracking-tight text-balance"
          >
            Tu pedido es el #{numero}
          </h1>
          <p className="mt-2 text-base text-neutral-600">
            Ya lo tiene el local.
          </p>

          {pedido ? (
            <section className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
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
                Si lo perdés, pedíselo al local por WhatsApp. También quedó
                en el mensaje que le mandaste.
              </p>
            </section>
          ) : (
            <p className="mt-8 rounded-2xl bg-white p-5 text-base text-pretty text-neutral-600 ring-1 ring-neutral-200">
              Si no tenés el link para seguir tu pedido, pedíselo al local
              por WhatsApp.
            </p>
          )}

          {estadoWhatsapp === "sin-abrir" ? (
            <p
              role="alert"
              className="mt-6 rounded-2xl bg-amber-50 px-4 py-4 text-base text-pretty text-amber-950 ring-1 ring-amber-200"
            >
              <strong className="font-semibold">WhatsApp no se abrió.</strong>{" "}
              {pedido
                ? "Tocá «Ir al chat del local» y apretá enviar: tu pedido ya va escrito."
                : `Tocá «Ir al chat del local» y contale que hiciste el pedido #${numero}.`}
            </p>
          ) : (
            <p className="mt-6 text-sm text-pretty text-neutral-500">
              {pedido
                ? "¿No llegaste a mandar el mensaje con tu pedido? Tocá «Ir al chat del local»: va a estar escrito."
                : `¿No llegaste a mandarle el mensaje al local? Tocá «Ir al chat del local» y contale que hiciste el pedido #${numero}.`}
            </p>
          )}
        </div>

        {estadoWhatsapp === "abriendo" && <CapaAbriendoWhatsapp />}

        <div className="mt-10 space-y-3">
          <a
            href={enlaceChat}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(evento) => {
              // Mismo camino que el intento automático (app directa en el
              // celular, con la capa de espera; wa.me si ya falló una vez,
              // o en la compu).
              evento.preventDefault();
              onAbrirChat(mensajeChat);
            }}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-green-600/20 active:bg-green-700"
          >
            <IconoChat className="h-6 w-6 shrink-0" />
            Ir al chat del local
          </a>
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
 * Mientras se abre WhatsApp, encima de esta pantalla. Semitransparente a
 * propósito: el cliente alcanza a ver que hay algo debajo, y al volver
 * encuentra ahí el link. La saca la landing (cuando el cliente vuelve a la
 * pestaña, o al tope de espera): ver abrirWhatsapp en landing.tsx.
 */
function CapaAbriendoWhatsapp() {
  return (
    <div
      role="status"
      className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-neutral-50/75 px-8 text-center backdrop-blur-[2px]"
    >
      <span
        aria-hidden="true"
        className="h-14 w-14 animate-spin rounded-full border-4 border-green-200 border-t-green-600 motion-reduce:animate-none"
      />
      <div>
        <p className="text-2xl font-bold text-neutral-900">
          Abriendo WhatsApp…
        </p>
        <p className="mt-2 max-w-xs text-base text-pretty text-neutral-700">
          Cuando vuelvas, vas a encontrar acá el link para seguir tu pedido.
        </p>
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
