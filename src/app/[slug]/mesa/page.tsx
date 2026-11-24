import type { Metadata, Viewport } from "next";

import { AvisoPublico } from "../aviso-publico";
import { aCategoriasCarta, obtenerCarta } from "../carta-leida";
import { IconoLocal, IconoReloj } from "../iconos";
import { CartaMesa } from "./carta-mesa";

export const viewport: Viewport = { themeColor: "#ffffff" };

/**
 * `noindex` siempre: es la pantalla de un QR pegado en una mesa, no una
 * página para buscar en Google. (La landing de take away sí se indexa.)
 */
export async function generateMetadata({
  params,
}: PageProps<"/[slug]/mesa">): Promise<Metadata> {
  const { slug } = await params;
  const carta = await obtenerCarta(slug);
  return {
    title: carta ? `${carta.comercio.nombre} · Pedí desde tu mesa` : "Local no disponible",
    robots: { index: false },
  };
}

/**
 * La carta para pedir desde la mesa, a donde lleva el QR impreso
 * (/{slug}/mesa). Es una dirección propia, distinta de la landing de take
 * away: así el cliente que escanea en la mesa cae directo en modo mesa, sin
 * tener que elegir nada — con plan `completo` las dos convivirían en el
 * mismo link y no habría forma de saber desde dónde escaneó.
 *
 * Todo lo que puede salir mal es una pantalla con un texto, no un error:
 * quien está leyendo esto es un cliente sentado en una mesa, no alguien
 * que pueda arreglar nada. En orden:
 *
 * - el link está mal escrito, o el comercio no existe o está suspendido;
 * - el plan del local no incluye salón;
 * - el local no tiene el QR de mesa prendido;
 * - la carta está vacía;
 * - la caja está cerrada: la carta se ve igual (para los precios), pero no
 *   se puede pedir — eso lo maneja la pantalla, no esta página, porque se
 *   puede habilitar sola mientras el cliente mira (VigilarEstadoLocal).
 *
 * Sin `notFound()` a propósito: con eso Next manda el HTML vacío y el
 * aviso lo dibuja recién el JavaScript (en un celular lento, pantalla en
 * blanco). Así llega armado.
 */
export default async function PaginaMesa({
  params,
}: PageProps<"/[slug]/mesa">) {
  const { slug } = await params;
  const carta = await obtenerCarta(slug);

  // `carta_publica` no distingue "no existe" de "suspendido" (las dos dan
  // null) y está bien: a quien escaneó no le cambia nada, y la página
  // tampoco confirma qué comercios existen.
  if (!carta) {
    return (
      <AvisoPublico titulo="Este local no está disponible">
        <p>
          Puede que el código QR esté dañado o que el local no esté tomando
          pedidos por acá en este momento.
        </p>
        <p className="font-semibold text-neutral-700">
          Llamá al mozo y pedile la carta.
        </p>
      </AvisoPublico>
    );
  }

  const { comercio } = carta;

  // Las mismas dos condiciones que exige `crear_borrador_qr`: plan con
  // salón y el interruptor del dueño prendido. Se chequean acá para no
  // dejarlo armar un pedido que después no se va a poder crear.
  if (comercio.plan === "take_away" || !comercio.qr_mesa_activo) {
    return (
      <AvisoPublico
        titulo={`${comercio.nombre} no toma pedidos por QR`}
        icono={<IconoLocal className="h-8 w-8" />}
      >
        <p>Acá el pedido se lo hacés al mozo.</p>
        <p className="font-semibold text-neutral-700">
          Llamalo y pedile la carta.
        </p>
      </AvisoPublico>
    );
  }

  const categorias = aCategoriasCarta(carta);

  if (categorias.length === 0) {
    return (
      <AvisoPublico
        titulo={`${comercio.nombre} todavía no tiene su carta cargada`}
        icono={<IconoReloj className="h-8 w-8" />}
      >
        <p className="font-semibold text-neutral-700">
          Llamá al mozo y pedile la carta.
        </p>
      </AvisoPublico>
    );
  }

  return (
    <CartaMesa
      slug={slug}
      comercio={{ nombre: comercio.nombre }}
      tomandoPedidos={comercio.tomando_pedidos}
      leidaEn={carta.leidaEn}
      categorias={categorias}
    />
  );
}
