import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cache, type ReactNode } from "react";

import { validarSlug } from "@/lib/comercios/validacion";
import { formatearPrecio, subtotalLinea, totalDelPedido } from "@/lib/landing/precios";
import {
  etapaDelPedido,
  etapaTerminada,
  type EtapaPedido,
} from "@/lib/landing/seguimiento";
import { esUuid } from "@/lib/landing/validacion";
import { enlaceWhatsApp, mensajeConsultaPedido } from "@/lib/landing/whatsapp";
import { crearClientePublico } from "@/lib/supabase/publico";

import { AvisoPublico } from "../../aviso-publico";
import {
  IconoBolsa,
  IconoCancelado,
  IconoChat,
  IconoListo,
  IconoOlla,
  IconoReloj,
} from "../../iconos";

import { ActualizarSeguimiento } from "./actualizar-seguimiento";
import { OlvidarPedidoGuardado } from "./olvidar-pedido";

/**
 * Seguimiento de un pedido de la landing, sin cuenta ni login: el link
 * lleva el `codigo_seguimiento` (un uuid al azar, imposible de adivinar),
 * nunca el número de pedido. El cliente lo recibe apenas confirma (en la
 * pantalla de "pedido enviado" y en su propio mensaje de WhatsApp), y el
 * mostrador lo tiene para reenviárselo. `seguimiento_pedido` no devuelve
 * nada si el código no existe, si es de otro comercio, o si el link ya
 * venció (un rato después de entregado o cancelado, o el tope desde que
 * se hizo: ver plazos_seguimiento en supabase/migrations/) — en todos esos
 * casos, el mismo aviso de "no encontrado" (armado en el servidor, no con
 * `notFound()`: ver src/app/[slug]/page.tsx).
 *
 * Mismo cliente público que la landing (siempre como `anon`), y
 * `connection()` porque cada visita (y cada refresco automático) tiene que
 * traer el estado del momento.
 */
const obtenerSeguimiento = cache(async (slug: string, codigo: string) => {
  await connection();
  if (validarSlug(slug) !== null || !esUuid(codigo)) return null;

  const supabase = crearClientePublico();
  const { data, error } = await supabase.rpc("seguimiento_pedido", {
    p_slug: slug,
    p_codigo: codigo.toLowerCase(),
  });
  if (error) throw new Error(`seguimiento_pedido: ${error.message}`);
  return data;
});

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/pedido/[codigo]">): Promise<Metadata> {
  const { slug, codigo } = await params;
  const pedido = await obtenerSeguimiento(slug, codigo);
  return {
    title: pedido
      ? `Pedido #${pedido.numero} · ${pedido.comercio.nombre}`
      : "Pedido no encontrado",
    // El link es la llave del pedido: que no lo indexe ningún buscador, y
    // que no viaje como "referer" al tocar un link hacia afuera (WhatsApp).
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

const TEXTO_ETAPA: Record<
  EtapaPedido,
  (esEnvio: boolean) => { titulo: string; detalle: string }
> = {
  esperando: () => ({
    titulo: "El local está revisando tu pedido",
    detalle: "Apenas lo acepte, vas a ver acá cómo avanza.",
  }),
  preparando: () => ({
    titulo: "Están preparando tu pedido",
    detalle: "Cuando esté listo, lo vas a ver acá.",
  }),
  listo: (esEnvio) =>
    esEnvio
      ? { titulo: "Tu pedido va en camino", detalle: "Ya salió para tu casa." }
      : {
          titulo: "Tu pedido está listo para retirar",
          detalle: "Ya podés pasar a buscarlo por el local.",
        },
  entregado: () => ({
    titulo: "¡Gracias por tu pedido!",
    detalle: "Que lo disfrutes.",
  }),
  cancelado: () => ({
    titulo: "Tu pedido se canceló",
    detalle: "Si tenés alguna duda, consultale al local por WhatsApp.",
  }),
};

const ESTILO_ETAPA: Record<
  EtapaPedido,
  { tarjeta: string; icono: ReactNode; barra: string; barraVacia: string }
> = {
  esperando: {
    tarjeta: "bg-amber-50 text-amber-950 ring-1 ring-amber-200",
    icono: <IconoReloj className="h-10 w-10 text-amber-600" />,
    barra: "bg-amber-500",
    barraVacia: "bg-amber-200",
  },
  preparando: {
    tarjeta: "bg-sky-50 text-sky-950 ring-1 ring-sky-200",
    icono: <IconoOlla className="h-10 w-10 text-sky-600" />,
    barra: "bg-sky-600",
    barraVacia: "bg-sky-200",
  },
  listo: {
    tarjeta: "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20",
    icono: <IconoListo className="h-10 w-10 text-white" />,
    barra: "bg-white",
    barraVacia: "bg-white/30",
  },
  entregado: {
    tarjeta: "bg-white text-neutral-900 ring-1 ring-neutral-200",
    icono: <IconoBolsa className="h-10 w-10 text-emerald-600" />,
    barra: "bg-emerald-600",
    barraVacia: "bg-neutral-200",
  },
  cancelado: {
    tarjeta: "bg-red-50 text-red-950 ring-1 ring-red-200",
    icono: <IconoCancelado className="h-10 w-10 text-red-600" />,
    barra: "",
    barraVacia: "",
  },
};

// Cuántos pasos de "Recibido → En preparación → Listo (o En camino) →
// Retirado (o Entregado)" ya se cumplieron.
const PASOS_CUMPLIDOS: Record<Exclude<EtapaPedido, "cancelado">, number> = {
  esperando: 1,
  preparando: 2,
  listo: 3,
  entregado: 4,
};

export default async function PaginaSeguimiento({
  params,
}: PageProps<"/[slug]/pedido/[codigo]">) {
  const { slug, codigo } = await params;
  const pedido = await obtenerSeguimiento(slug, codigo);

  if (!pedido) {
    return (
      <AvisoPublico titulo="No encontramos este pedido">
        {/* El link ya no sirve: si el celular lo tenía guardado, no tiene
            sentido seguir ofreciéndolo en la landing. */}
        <OlvidarPedidoGuardado slug={slug} codigo={codigo} />
        <p>
          Puede que el link esté incompleto, o que el pedido ya haya
          terminado.
        </p>
        <Link
          href={`/${slug}`}
          className="inline-flex rounded-full bg-neutral-900 px-6 py-3.5 font-semibold text-white active:bg-neutral-700"
        >
          Ver la carta del local
        </Link>
      </AvisoPublico>
    );
  }

  const etapa = etapaDelPedido(pedido.estado, pedido.items);
  const terminado = etapaTerminada(etapa);
  const esEnvio = pedido.modalidad === "envio";
  const texto = TEXTO_ETAPA[etapa](esEnvio);
  const estilo = ESTILO_ETAPA[etapa];
  const total = totalDelPedido(pedido.items);
  const { whatsapp } = pedido.comercio;
  const hora = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: pedido.comercio.zona_horaria,
  }).format(new Date(pedido.creado_en));
  const pasos = esEnvio
    ? ["Recibido", "En preparación", "En camino", "Entregado"]
    : ["Recibido", "En preparación", "Listo", "Retirado"];

  return (
    <div className="min-h-dvh flex-1 bg-neutral-50 font-sans text-neutral-900 scheme-light">
      {/* Pedido cerrado (entregado o cancelado): el cliente ya lo vio acá,
          así que la landing deja de ofrecerle "Tu pedido #N". Con el pedido
          en curso no se toca nada; si se cierra mientras mira, aparece con
          el refresco automático y lo borra en ese momento. */}
      {terminado && <OlvidarPedidoGuardado slug={slug} codigo={codigo} />}
      <main className="mx-auto max-w-lg px-4 pt-8 pb-16">
        <p className="text-base font-semibold text-neutral-500">
          {pedido.comercio.nombre}
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          Pedido #{pedido.numero}
        </h1>
        <p className="mt-1 text-base text-neutral-600">
          Hecho a las {hora}, a nombre de {pedido.cliente_nombre}
        </p>

        <section
          aria-live="polite"
          className={`mt-6 rounded-3xl p-6 ${estilo.tarjeta}`}
        >
          {estilo.icono}
          <h2 className="mt-3 text-2xl leading-tight font-bold text-balance">
            {texto.titulo}
          </h2>
          <p className="mt-1 text-base text-pretty opacity-90">
            {texto.detalle}
          </p>

          {etapa !== "cancelado" && (
            <ol className="mt-6 grid grid-cols-4 gap-2">
              {pasos.map((paso, indice) => {
                const cumplido = indice < PASOS_CUMPLIDOS[etapa];
                return (
                  <li key={paso} className="min-w-0">
                    <span
                      aria-hidden="true"
                      className={`block h-1.5 rounded-full ${
                        cumplido ? estilo.barra : estilo.barraVacia
                      }`}
                    />
                    <span
                      className={`mt-2 block text-xs leading-tight sm:text-sm ${
                        cumplido ? "font-semibold" : "opacity-60"
                      }`}
                    >
                      {paso}
                      <span className="sr-only">
                        {cumplido ? " (hecho)" : " (falta)"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <ActualizarSeguimiento activo={!terminado} />
        </section>

        {whatsapp && etapa === "cancelado" && (
          <a
            href={enlaceWhatsApp(whatsapp, mensajeConsultaPedido(pedido))}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-6 py-5 text-lg font-bold text-white shadow-lg shadow-green-600/20 active:bg-green-700"
          >
            <IconoChat className="h-6 w-6 shrink-0" />
            Consultar por WhatsApp
          </a>
        )}

        <section className="mt-6 rounded-2xl bg-white ring-1 ring-neutral-200">
          <h2 className="px-5 pt-5 text-lg font-bold">Tu pedido</h2>
          <ul className="mt-2 divide-y divide-neutral-100 px-5">
            {pedido.items.map((item, indice) => (
              <li
                key={`${item.nombre}-${indice}`}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold">
                    {item.cantidad} × {item.nombre}
                  </p>
                  {item.categoria_nombre && (
                    <p className="text-sm text-neutral-500">
                      {item.categoria_nombre}
                    </p>
                  )}
                  {item.adicionales.length > 0 && (
                    <p className="mt-0.5 text-sm text-neutral-600">
                      Con:{" "}
                      {item.adicionales
                        .map((adicional) => adicional.nombre)
                        .join(", ")}
                    </p>
                  )}
                  {item.nota && (
                    <p className="mt-0.5 text-sm text-neutral-600 italic">
                      “{item.nota}”
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-base font-semibold tabular-nums">
                  {formatearPrecio(
                    subtotalLinea(
                      item.precio_unitario,
                      item.adicionales.map((adicional) => adicional.precio_extra),
                      item.cantidad,
                    ),
                  )}
                </p>
              </li>
            ))}
          </ul>

          <div className="mx-5 border-t border-neutral-200 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-black tabular-nums">
                {formatearPrecio(total)}
              </span>
            </div>
            {esEnvio && (
              <p className="mt-1 text-sm text-neutral-600">
                Más el envío, que arreglás con el local.
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              Documento no válido como factura.
            </p>
          </div>

          <dl className="space-y-3 rounded-b-2xl bg-neutral-50 px-5 py-4 text-base">
            <div>
              <dt className="text-sm text-neutral-500">Entrega</dt>
              <dd className="font-medium">
                {esEnvio
                  ? `Envío a ${pedido.direccion ?? ""}`
                  : "Lo pasás a buscar por el local"}
              </dd>
            </div>
            {pedido.nota && (
              <div>
                <dt className="text-sm text-neutral-500">Aclaración</dt>
                <dd className="font-medium">{pedido.nota}</dd>
              </div>
            )}
          </dl>
        </section>

        <div className="mt-8 flex flex-col items-center gap-3">
          {whatsapp && etapa !== "cancelado" && (
            <a
              href={enlaceWhatsApp(whatsapp, mensajeConsultaPedido(pedido))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 active:bg-neutral-100"
            >
              <IconoChat className="h-5 w-5" />
              Escribirle al local
            </a>
          )}
          <Link
            href={`/${slug}`}
            className="rounded-full px-5 py-3 font-semibold text-neutral-600 active:bg-neutral-100"
          >
            {terminado ? "Hacer otro pedido" : "Ver la carta del local"}
          </Link>
        </div>
      </main>
    </div>
  );
}
