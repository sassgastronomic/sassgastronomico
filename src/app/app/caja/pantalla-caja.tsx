"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { formatearPrecio } from "@/lib/landing/precios";
import { suscribirseConSesion } from "@/lib/supabase/realtime";
import type { PendientesCaja, ResumenJornada } from "@/types/database";

import { abrirCaja, cerrarCaja } from "./actions";

type CajaAbiertaVista = {
  id: string;
  // Ya formateada ("mar 14/10").
  jornada: string;
  // false: quedó abierta la de una jornada anterior.
  esDeHoy: boolean;
  horaApertura: string;
  abiertaPor: string | null;
};

/**
 * Pantalla de caja (celular). Tres situaciones:
 * - cerrada: botón para abrir la jornada de hoy (o reabrirla, si ya se
 *   cerró hoy);
 * - abierta, de hoy: el resumen de la jornada y el botón para cerrarla;
 * - abierta, pero de una jornada anterior: lo mismo, con el aviso de que
 *   hay que cerrarla antes de abrir la de hoy (la base no deja abrir otra
 *   mientras tanto), para que los números de cada jornada no se mezclen.
 *
 * Se actualiza en vivo (caja, pedidos y mesas del comercio): lo que falta
 * para cerrar se va tachando solo a medida que se entrega.
 */
export function PantallaCaja({
  comercioId,
  jornadaHoy,
  cerradaHoy,
  abierta,
  resumen,
  conPedidosOnline,
}: {
  comercioId: string;
  jornadaHoy: string;
  cerradaHoy: boolean;
  abierta: CajaAbiertaVista | null;
  resumen: (ResumenJornada & { pendientes: PendientesCaja }) | null;
  conPedidosOnline: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cierre, setCierre] = useState<{
    jornada: string;
    reactivados: number;
  } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    function programarRefresco() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => router.refresh(), 400);
    }
    const desuscribirse = suscribirseConSesion((supabase) => {
      let canal = supabase.channel(`caja-${comercioId}`);
      for (const tabla of ["cajas", "pedidos", "cuentas"] as const) {
        canal = canal.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: tabla,
            filter: `comercio_id=eq.${comercioId}`,
          },
          programarRefresco,
        );
      }
      return canal.subscribe();
    });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      desuscribirse();
    };
  }, [comercioId, router]);

  // Escape cierra la confirmación.
  useEffect(() => {
    if (!confirmando) return;
    function alApretarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setConfirmando(false);
    }
    window.addEventListener("keydown", alApretarTecla);
    return () => window.removeEventListener("keydown", alApretarTecla);
  }, [confirmando]);

  function abrir() {
    setError(null);
    setCierre(null);
    iniciarTransicion(async () => {
      const resultado = await abrirCaja();
      if (!resultado.ok) setError(resultado.error);
    });
  }

  function cerrar(caja: CajaAbiertaVista) {
    setConfirmando(false);
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await cerrarCaja(caja.id);
      if (resultado.tipo === "cerrada") {
        setCierre({ jornada: caja.jornada, reactivados: resultado.reactivados });
      } else if (resultado.tipo === "pendientes") {
        // La página ya se volvió a pedir: lo que falta aparece abajo.
        setError("Todavía hay cosas sin terminar: mirá abajo qué falta.");
        router.refresh();
      } else {
        setError(resultado.error);
      }
    });
  }

  const pendientes = resumen?.pendientes;
  const hayPendientes =
    !!pendientes &&
    (pendientes.mesas_abiertas.length > 0 ||
      pendientes.pedidos_sin_entregar.length > 0);

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <h1 className="text-2xl font-bold text-neutral-900">Caja</h1>

      {cierre && (
        <p
          role="status"
          className="rounded-2xl bg-green-50 px-4 py-4 text-base text-green-900 ring-1 ring-green-200"
        >
          <strong className="font-semibold">
            Caja de la jornada {cierre.jornada} cerrada.
          </strong>{" "}
          {cierre.reactivados > 0
            ? `Se reactivaron ${cierre.reactivados} ${
                cierre.reactivados === 1 ? "producto que estaba" : "productos que estaban"
              } sin stock, para la jornada siguiente.`
            : "No había productos sin stock para reactivar."}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-base font-medium text-red-800 ring-1 ring-red-200"
        >
          {error}
        </p>
      )}

      {!abierta ? (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="text-xl font-bold text-amber-950">
            La caja está cerrada
          </p>
          <p className="mt-1 text-base text-pretty text-amber-900">
            Con la caja cerrada el local no opera:{" "}
            {conPedidosOnline ? "no entran pedidos online y " : ""}los mozos
            no pueden abrir mesas ni cargar pedidos.
          </p>
          <button
            type="button"
            onClick={abrir}
            disabled={pendiente}
            className="mt-5 w-full rounded-2xl bg-green-600 px-5 py-4 text-lg font-bold text-white active:bg-green-700 disabled:opacity-60"
          >
            {pendiente
              ? "Abriendo…"
              : cerradaHoy
                ? `Reabrir la caja de hoy (${jornadaHoy})`
                : `Abrir la caja · jornada ${jornadaHoy}`}
          </button>
          {cerradaHoy && (
            <p className="mt-3 text-sm text-pretty text-amber-900">
              La caja de hoy ya se cerró una vez. Si la reabrís, la jornada
              sigue con los mismos números y el próximo cierre vuelve a
              incluir todo el día.
            </p>
          )}
        </section>
      ) : (
        <>
          {!abierta.esDeHoy && (
            <section
              role="alert"
              className="rounded-2xl border-2 border-red-300 bg-red-50 p-5"
            >
              <p className="text-lg font-bold text-red-900">
                Quedó una jornada sin cerrar
              </p>
              <ul className="mt-2 list-disc pl-5 text-base text-red-900">
                <li>Jornada {abierta.jornada}</li>
              </ul>
              <p className="mt-2 text-base text-pretty text-red-900">
                Cerrala antes de abrir la de hoy ({jornadaHoy}), así los
                números de cada jornada no se mezclan. Abajo está su resumen.
              </p>
            </section>
          )}

          <section className="rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
            <p className="flex items-center gap-2 text-lg font-bold text-neutral-900">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Caja abierta · jornada {abierta.jornada}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Desde las {abierta.horaApertura}
              {abierta.abiertaPor ? `, la abrió ${abierta.abiertaPor}` : ""}.
            </p>
            {abierta.esDeHoy && conPedidosOnline && (
              <Link
                href="/app/pedidos"
                className="mt-3 inline-flex rounded-xl px-3 py-2 text-base font-semibold text-neutral-800 ring-1 ring-neutral-300 active:bg-neutral-100"
              >
                Ir a pedidos online →
              </Link>
            )}
          </section>

          {resumen && <ResumenDeJornada resumen={resumen} />}

          {hayPendientes && pendientes && (
            <section
              role="alert"
              className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200"
            >
              <p className="text-base font-bold text-red-900">
                Para cerrar la caja falta:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-red-900">
                {pendientes.mesas_abiertas.length > 0 && (
                  <li>
                    {pendientes.mesas_abiertas.length === 1
                      ? "1 mesa con la cuenta abierta"
                      : `${pendientes.mesas_abiertas.length} mesas con la cuenta abierta`}
                    : {pendientes.mesas_abiertas.join(", ")}
                  </li>
                )}
                {pendientes.pedidos_sin_entregar.length > 0 && (
                  <li>
                    {pendientes.pedidos_sin_entregar.length === 1
                      ? "1 pedido sin entregar"
                      : `${pendientes.pedidos_sin_entregar.length} pedidos sin entregar`}
                    :{" "}
                    {pendientes.pedidos_sin_entregar
                      .map((numero) => `#${numero}`)
                      .join(", ")}
                  </li>
                )}
              </ul>
              <p className="mt-2 text-sm text-pretty text-red-800">
                Las mesas se cierran desde Atender mesas; los pedidos se
                entregan o se cancelan
                {conPedidosOnline ? " desde Pedidos online" : ""}.
              </p>
            </section>
          )}

          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={pendiente || hayPendientes}
            className="w-full rounded-2xl bg-neutral-900 px-5 py-4 text-lg font-bold text-white active:bg-neutral-700 disabled:opacity-50"
          >
            {pendiente ? "Cerrando…" : `Cerrar la caja · jornada ${abierta.jornada}`}
          </button>

          {confirmando && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/40 p-4 sm:items-center">
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="titulo-cerrar-caja"
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              >
                <h2
                  id="titulo-cerrar-caja"
                  className="text-xl font-bold text-neutral-900"
                >
                  ¿Cerrar la caja de la jornada {abierta.jornada}?
                </h2>
                <p className="mt-2 text-base text-pretty text-neutral-600">
                  Hasta que se abra de nuevo no entran pedidos ni se abren
                  mesas. Los productos marcados sin stock se reactivan para la
                  jornada siguiente.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    // El foco arranca en la opción que no hace nada.
                    autoFocus
                    onClick={() => setConfirmando(false)}
                    className="rounded-xl px-4 py-3 text-base font-semibold text-neutral-700 ring-1 ring-neutral-300 active:bg-neutral-100"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => cerrar(abierta)}
                    className="rounded-xl bg-neutral-900 px-4 py-3 text-base font-bold text-white active:bg-neutral-700"
                  >
                    Sí, cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResumenDeJornada({ resumen }: { resumen: ResumenJornada }) {
  const { pedidos } = resumen;
  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-neutral-200">
      <h2 className="text-lg font-bold text-neutral-900">
        Resumen de la jornada
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-xl bg-neutral-50 p-4">
          <p className="text-sm text-neutral-500">Total vendido</p>
          <p className="text-3xl font-black text-neutral-900 tabular-nums">
            {formatearPrecio(resumen.total)}
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <p className="text-sm text-neutral-500">Salón</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums">
            {pedidos.salon_mesas} {pedidos.salon_mesas === 1 ? "mesa" : "mesas"}
          </p>
          <p className="text-sm text-neutral-500">
            {pedidos.salon_rondas} {pedidos.salon_rondas === 1 ? "ronda" : "rondas"}
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <p className="text-sm text-neutral-500">Take away</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums">
            {pedidos.take_away} {pedidos.take_away === 1 ? "pedido" : "pedidos"}
          </p>
        </div>
      </div>
      {pedidos.cancelados > 0 && (
        <p className="text-sm text-neutral-500">
          {pedidos.cancelados}{" "}
          {pedidos.cancelados === 1 ? "pedido cancelado" : "pedidos cancelados"}{" "}
          (no suman al total).
        </p>
      )}

      <div>
        <h3 className="text-base font-bold text-neutral-900">Por categoría</h3>
        {resumen.categorias.length === 0 ? (
          <p className="mt-1 text-base text-neutral-500">
            Todavía no hay ventas en esta jornada.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
            {resumen.categorias.map((categoria) => (
              <li key={categoria.nombre}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block font-semibold text-neutral-900">
                        {categoria.nombre}
                      </span>
                      <span className="block text-sm text-neutral-500">
                        {categoria.unidades}{" "}
                        {categoria.unidades === 1 ? "unidad" : "unidades"} · tocá
                        para ver los productos
                      </span>
                    </span>
                    <span className="shrink-0 font-bold text-neutral-900 tabular-nums">
                      {formatearPrecio(categoria.total)}
                    </span>
                  </summary>
                  <ul className="space-y-1 border-t border-neutral-100 bg-neutral-50 px-4 py-3 text-sm">
                    {categoria.productos.map((producto) => (
                      <li
                        key={producto.nombre}
                        className="flex justify-between gap-3"
                      >
                        <span className="text-neutral-700">
                          {producto.unidades} × {producto.nombre}
                        </span>
                        <span className="shrink-0 text-neutral-900 tabular-nums">
                          {formatearPrecio(producto.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-pretty text-neutral-500">
        Resumen interno de gestión: cuenta solo los pedidos de esta jornada y
        lo cancelado no suma. No es un comprobante y no reemplaza el cierre
        fiscal ni los comprobantes del local.
      </p>
    </section>
  );
}
