"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";

import {
  leerEstadoLocal,
  urlEstadoLocal,
  type EstadoLocal,
} from "@/lib/landing/estado";

// Cada cuánto se pregunta, solo con la pantalla a la vista.
const CONSULTA_CADA_MS = 60_000;

// Volver a la pantalla, desbloquear el celular o recuperar la conexión
// también preguntan, pero no más seguido que esto: al volver suelen llegar
// varios eventos juntos.
const MINIMO_ENTRE_CONSULTAS_MS = 10_000;

// Una consulta que no contesta en este tiempo se corta: queda para la
// próxima.
const TOPE_CONSULTA_MS = 8_000;

/**
 * Mantiene la landing al día con el local, sin que el cliente recargue:
 *
 * - Si el local abre la caja, se habilita sola; si la cierra, se bloquea.
 *   Para eso vuelve a pedir la página al servidor (`router.refresh()`): la
 *   carta también puede haber cambiado, y lo que manda es lo que dice la
 *   página.
 * - Lo que se queda sin stock (o vuelve a haber) se aplica acá mismo
 *   (`onSinStock`), sin pedir la página: es lo que más cambia durante la
 *   jornada, y así no le cuesta a la base una carta entera por cliente.
 *
 * Pregunta al endpoint cacheado (src/lib/landing/estado.ts) cada
 * CONSULTA_CADA_MS y al volver a la pantalla; con el local cerrado, también
 * al entrar (la página puede venir guardada por el navegador, al volver
 * con "atrás"). Nunca con la pantalla oculta.
 *
 * La respuesta puede venir atrasada (el CDN la guarda un rato): si se leyó
 * antes que la carta de esta página (`leidaEn`), se descarta. Las dos
 * horas son del servidor, así que se pueden comparar.
 *
 * `pausado`: con una vista abierta (un producto, el pedido, la pantalla de
 * "pedido enviado") no se recarga la página: recargar le borra a esa
 * entrada del historial lo que el "atrás" necesita para cerrarla. El stock
 * sí se aplica (no recarga nada). Si el local cierra mientras alguien
 * confirma, la base lo rechaza y la página se actualiza igual (ver
 * HojaPedido).
 */
export function VigilarEstadoLocal({
  slug,
  tomandoPedidos,
  leidaEn,
  pausado,
  onSinStock,
}: {
  slug: string;
  tomandoPedidos: boolean;
  // Cuándo se leyó la carta de esta página (reloj del servidor).
  leidaEn: number;
  pausado: boolean;
  onSinStock: (ids: ReadonlySet<string>) => void;
}) {
  const router = useRouter();
  const refEnCurso = useRef(false);
  const refUltimaConsulta = useRef(0);

  // Con los props de ahora, no los de cuando salió la consulta: pueden
  // haber cambiado en el medio.
  const alResponder = useEffectEvent((estado: EstadoLocal) => {
    if (estado.leidoEn <= leidaEn) return;
    onSinStock(new Set(estado.sinStock));
    if (estado.tomandoPedidos !== tomandoPedidos && !pausado) {
      router.refresh();
    }
  });

  const consultar = useEffectEvent(async (vida: AbortSignal) => {
    if (
      vida.aborted ||
      refEnCurso.current ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    const ahora = Date.now();
    if (ahora - refUltimaConsulta.current < MINIMO_ENTRE_CONSULTAS_MS) return;
    refUltimaConsulta.current = ahora;
    refEnCurso.current = true;

    // Se corta por el tope o si la pantalla se va (`vida`).
    const control = new AbortController();
    const cortar = () => control.abort();
    const tope = setTimeout(cortar, TOPE_CONSULTA_MS);
    vida.addEventListener("abort", cortar);
    try {
      // Sin cookies: la respuesta es la misma para todos, y así la guarda
      // el CDN.
      const respuesta = await fetch(urlEstadoLocal(slug), {
        credentials: "omit",
        signal: control.signal,
      });
      const estado = respuesta.ok
        ? leerEstadoLocal(await respuesta.json())
        : null;
      if (estado && !vida.aborted) alResponder(estado);
    } catch {
      // Sin conexión, o se cortó: queda para la próxima.
    } finally {
      clearTimeout(tope);
      vida.removeEventListener("abort", cortar);
      refEnCurso.current = false;
    }
  });

  useEffect(() => {
    const vida = new AbortController();
    const preguntar = () => void consultar(vida.signal);

    if (!tomandoPedidos) preguntar();
    const intervalo = setInterval(preguntar, CONSULTA_CADA_MS);
    // `pageshow`: volver con "atrás" a la página guardada por el navegador.
    // `focus`: en la compu, volver a la ventana sin que haya estado oculta.
    document.addEventListener("visibilitychange", preguntar);
    window.addEventListener("pageshow", preguntar);
    window.addEventListener("focus", preguntar);
    window.addEventListener("online", preguntar);
    return () => {
      vida.abort();
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", preguntar);
      window.removeEventListener("pageshow", preguntar);
      window.removeEventListener("focus", preguntar);
      window.removeEventListener("online", preguntar);
    };
  }, [tomandoPedidos]);

  return null;
}
