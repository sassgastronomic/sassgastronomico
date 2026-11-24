"use client";

import { useCallback } from "react";

/**
 * Las vistas de las pantallas del cliente (la hoja de un producto, la del
 * pedido, la confirmación, el QR) son parte de la URL, con
 * `history.pushState`. Así el "atrás" del celular — o el gesto de deslizar
 * en iPhone — cierra la vista en vez de sacar al cliente de la página, que
 * es lo que haría cualquiera que no conoce la pantalla.
 *
 * Los parámetros están todos acá, de las dos pantallas juntas, aunque cada
 * una use los suyos: lo único que importa es que `paramsSinVistas` sepa
 * borrarlos todos, y una sola lista no se desincroniza.
 */

// Comunes a las dos pantallas.
export const PARAM_PRODUCTO = "producto";
export const PARAM_VER = "ver";
// Solo de la landing de take away.
export const PARAM_ENVIADO = "enviado";
// Solo del QR de mesa.
export const PARAM_QR = "qr";

const PARAMS_DE_VISTAS = [
  PARAM_PRODUCTO,
  PARAM_VER,
  PARAM_ENVIADO,
  PARAM_QR,
] as const;

/**
 * Cuántas vistas propias de la pantalla hay en el historial hasta la carta
 * (1 = una hoja; 2 = la confirmación arriba de la hoja del pedido). Va en
 * `history.state`, que Next conserva al ir y volver con el navegador.
 */
const CLAVE_PROFUNDIDAD = "profundidadCarta";

export function idSeccion(categoriaId: string): string {
  return `categoria-${categoriaId}`;
}

export function comportamientoScroll(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function profundidadActual(): number {
  const estado: unknown = window.history.state;
  if (typeof estado !== "object" || estado === null) return 0;
  const valor: unknown = Reflect.get(estado, CLAVE_PROFUNDIDAD);
  return typeof valor === "number" && valor > 0 ? valor : 0;
}

/** Los parámetros de la URL actual, sin los de las vistas. */
export function paramsSinVistas(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  for (const parametro of PARAMS_DE_VISTAS) params.delete(parametro);
  return params;
}

export function urlDe(params: URLSearchParams): string {
  const texto = params.toString();
  return texto ? `?${texto}` : window.location.pathname;
}

export type Vistas = {
  /** Abre una vista: una entrada más en el historial. */
  abrirVista: (parametro: string, valor: string) => void;
  /**
   * Reemplaza la vista actual sin agregar una entrada al historial, para
   * cuando una vista se convierte en otra (la confirmación pasa a ser la
   * pantalla de enviado, o el pedido pasa a ser el QR): así el "volver a
   * la carta" sabe cuánto retroceder.
   */
  reemplazarVista: (parametro: string, valor: string) => void;
  /**
   * Un paso atrás. Si la vista la agregó la pantalla, es el "atrás" del
   * navegador (queda igual que tocarlo); si se entró con el parámetro ya
   * puesto (un link compartido, una recarga que perdió el historial), se
   * reemplaza la URL por `destino`: "atrás" sacaría al cliente de la
   * página.
   */
  volverUnPaso: (destino: URLSearchParams) => void;
  /** A la carta, salteando las vistas que quedaron atrás en el historial. */
  volverALaCarta: () => void;
};

export function useVistas(): Vistas {
  const abrirVista = useCallback((parametro: string, valor: string) => {
    const params = paramsSinVistas();
    params.set(parametro, valor);
    window.history.pushState(
      { [CLAVE_PROFUNDIDAD]: profundidadActual() + 1 },
      "",
      urlDe(params),
    );
  }, []);

  const reemplazarVista = useCallback((parametro: string, valor: string) => {
    const params = paramsSinVistas();
    params.set(parametro, valor);
    window.history.replaceState(
      { [CLAVE_PROFUNDIDAD]: profundidadActual() },
      "",
      urlDe(params),
    );
  }, []);

  const volverUnPaso = useCallback((destino: URLSearchParams) => {
    if (profundidadActual() > 0) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", urlDe(destino));
  }, []);

  const volverALaCarta = useCallback(() => {
    const profundidad = profundidadActual();
    if (profundidad > 0) {
      window.history.go(-profundidad);
      return;
    }
    window.history.replaceState(null, "", urlDe(paramsSinVistas()));
  }, []);

  return { abrirVista, reemplazarVista, volverUnPaso, volverALaCarta };
}
