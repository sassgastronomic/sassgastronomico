"use client";

import { useEffect, useState } from "react";

/**
 * El reloj del código de mesa: cuánto le falta para vencer y cómo se dice.
 *
 * Vive en un solo lugar porque lo miran dos pantallas a la vez (el aviso
 * arriba de la carta y la pantalla del QR) y tienen que coincidir: si cada
 * una tuviera su propio temporizador, una podría decir "vale 1 minuto más"
 * mientras la otra ya muestra "venció".
 */

/**
 * Cada cuánto se recalcula. Un segundo: el último minuto se muestra con
 * los segundos, y es un solo temporizador para toda la pantalla.
 */
const TIC_MS = 1000;

// Debajo de esto se muestran los segundos: el cliente tiene que ver que se
// le está acabando, no un "falta 1 minuto" congelado.
const UMBRAL_SEGUNDOS_MS = 2 * 60 * 1000;

/** Debajo de esto el aviso pasa a ámbar. */
export const UMBRAL_APURO_MS = 5 * 60 * 1000;

export function textoRestante(restanteMs: number): string {
  if (restanteMs >= UMBRAL_SEGUNDOS_MS) {
    const minutos = Math.ceil(restanteMs / 60_000);
    return `Vale por ${minutos} minutos más`;
  }
  const segundosTotales = Math.max(0, Math.ceil(restanteMs / 1000));
  const minutos = Math.floor(segundosTotales / 60);
  const segundos = segundosTotales % 60;
  return `Vale por ${minutos}:${String(segundos).padStart(2, "0")} más`;
}

/**
 * Cuánto falta, en milisegundos, para el instante `venceEn`. Con `null`
 * (no hay código) devuelve 0 y no deja ningún temporizador andando.
 *
 * Arranca en el valor de ahora (no en null) para que no haya un parpadeo
 * al montar.
 */
function calcular(venceEn: number | null): number {
  return venceEn === null ? 0 : venceEn - Date.now();
}

export function useRestante(venceEn: number | null): number {
  const [restante, setRestante] = useState(() => calcular(venceEn));

  // Si aparece un código nuevo (o se va el que había), el número se pone al
  // día en este mismo render, sin esperar el próximo tic: durante un
  // segundo mostraría lo que le faltaba al anterior. Es el patrón de
  // estado derivado de props que ya usa ../carta/usar-carrito.ts.
  const [venceEnPrevio, setVenceEnPrevio] = useState(venceEn);
  if (venceEnPrevio !== venceEn) {
    setVenceEnPrevio(venceEn);
    setRestante(calcular(venceEn));
  }

  useEffect(() => {
    if (venceEn === null) return;
    // Se recalcula contra el reloj en cada tic, y no restando el
    // intervalo: si el celular suspende la pantalla el temporizador se
    // atrasa, y una cuenta acumulada quedaría mintiendo.
    const recalcular = () => setRestante(calcular(venceEn));
    const temporizador = setInterval(recalcular, TIC_MS);
    // Volver a la pantalla después de un rato: que el número esté al día
    // antes del próximo tic.
    document.addEventListener("visibilitychange", recalcular);
    return () => {
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", recalcular);
    };
  }, [venceEn]);

  return restante;
}
