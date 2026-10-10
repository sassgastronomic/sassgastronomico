"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { formatearPrecio } from "@/lib/landing/precios";
import { suscribirseConSesion } from "@/lib/supabase/realtime";
import type { EstadoItem, ModalidadPedido } from "@/types/database";

import {
  aceptarPedido,
  cambiarCantidadItem,
  cancelarPedido,
  entregarPedido,
  type ResultadoAccionPedido,
} from "./actions";

export type EtapaMostrador = "nuevo" | "en_cocina" | "listo";

export type ItemMostrador = {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  cantidad: number;
  nota: string | null;
  estado: EstadoItem;
  adicionales: { nombre: string; precioExtra: number }[];
  subtotal: number;
};

export type PedidoMostrador = {
  id: string;
  numero: number | null;
  etapa: EtapaMostrador;
  modalidad: ModalidadPedido | null;
  clienteNombre: string;
  direccion: string | null;
  nota: string | null;
  // Desde cuándo está en la etapa actual, y lo mismo dicho para leer
  // ("hace 4 min"), calculado en el servidor.
  desde: string;
  hace: string;
  link: string | null;
  // El mensaje con el link, listo para pegar en el chat del cliente.
  mensajeLink: string | null;
  items: ItemMostrador[];
  listos: number;
  total: number;
};

const PESTANAS: { etapa: EtapaMostrador; etiqueta: string; vacio: string }[] = [
  {
    etapa: "nuevo",
    etiqueta: "Nuevos",
    vacio: "No hay pedidos nuevos. Cuando entre uno, aparece acá solo.",
  },
  {
    etapa: "en_cocina",
    etiqueta: "En cocina",
    vacio: "No hay pedidos en cocina.",
  },
  {
    etapa: "listo",
    etiqueta: "Listos para entregar",
    vacio: "No hay pedidos listos para entregar.",
  },
];

const TEXTO_TIEMPO: Record<EtapaMostrador, string> = {
  nuevo: "Llegó",
  en_cocina: "Aceptado",
  listo: "Listo",
};

// Mismos colores que las pantallas del mozo: azul es "listo".
const ESTADO_ITEM: Record<EstadoItem, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-neutral-200 text-neutral-700" },
  en_preparacion: {
    texto: "En preparación",
    clase: "bg-amber-100 text-amber-900",
  },
  listo: { texto: "Listo", clase: "bg-blue-600 text-white" },
  entregado: { texto: "Entregado", clase: "bg-green-100 text-green-800" },
};

/**
 * Mostrador: los pedidos de la landing, en tres pestañas.
 *
 * - Nuevos: se pueden editar (cantidades, sacar ítems) y después aceptar
 *   o rechazar. Aceptar es lo que lo convierte en comanda: cocina lo ve
 *   desde ese momento, igual que una ronda de salón.
 * - En cocina: el avance de cada ítem, en vivo.
 * - Listos para entregar: cuando cocina terminó todo, se entrega con un
 *   botón (todo junto).
 *
 * Cancelar se puede siempre, también después de aceptado. Y en las tres,
 * "Copiar link para el cliente" deja en el portapapeles un mensaje con el
 * link de seguimiento, para reenviárselo por el chat si lo perdió.
 *
 * Pensada para la compu del mostrador; en tablet, las tarjetas pasan a
 * una o dos columnas.
 */
export function PantallaMostrador({
  comercioId,
  pedidos,
}: {
  comercioId: string;
  pedidos: PedidoMostrador[];
}) {
  const router = useRouter();
  const [, iniciarTransicion] = useTransition();
  const [pestana, setPestana] = useState<EtapaMostrador>("nuevo");
  const [conectado, setConectado] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [aCancelar, setACancelar] = useState<PedidoMostrador | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const refTimerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  // En vivo: un pedido nuevo, otro mostrador que acepta, cocina que
  // avanza un ítem. No se mezcla el payload a mano: se vuelve a pedir la
  // página (mismo criterio que salón). Y un refresco por minuto, aunque no
  // cambie nada, para que los "hace X min" no queden viejos.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    function programarRefresco() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => router.refresh(), 400);
    }

    const desuscribirse = suscribirseConSesion((supabase) =>
      supabase
        .channel(`mostrador-${comercioId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pedidos",
            filter: `comercio_id=eq.${comercioId}`,
          },
          programarRefresco,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pedido_items",
            filter: `comercio_id=eq.${comercioId}`,
          },
          programarRefresco,
        )
        .subscribe((estado) => {
          setConectado(estado === "SUBSCRIBED");
          if (estado === "SUBSCRIBED") programarRefresco();
        }),
    );

    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(intervalo);
      desuscribirse();
    };
  }, [comercioId, router]);

  // Escape cierra el diálogo de cancelar.
  useEffect(() => {
    if (!aCancelar) return;
    function alApretarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setACancelar(null);
    }
    window.addEventListener("keydown", alApretarTecla);
    return () => window.removeEventListener("keydown", alApretarTecla);
  }, [aCancelar]);

  function mostrarAviso(texto: string) {
    if (refTimerAviso.current) clearTimeout(refTimerAviso.current);
    setAviso(texto);
    refTimerAviso.current = setTimeout(() => setAviso(null), 3500);
  }

  function ejecutar(
    pedido: PedidoMostrador,
    accion: () => Promise<ResultadoAccionPedido>,
    alSalirBien?: () => void,
  ) {
    setOcupado(pedido.id);
    setErrores(({ [pedido.id]: _anterior, ...resto }) => {
      void _anterior;
      return resto;
    });
    iniciarTransicion(async () => {
      const resultado = await accion();
      setOcupado(null);
      if (resultado.ok) {
        // La acción ya revalida la página; esto es solo el aviso.
        alSalirBien?.();
        return;
      }
      setErrores((actuales) => ({ ...actuales, [pedido.id]: resultado.error }));
      // Puede que otro lo haya cambiado mientras tanto (ya aceptado, ya
      // cancelado): se trae el estado de verdad.
      router.refresh();
    });
  }

  async function copiarLink(pedido: PedidoMostrador) {
    if (!pedido.mensajeLink) return;
    try {
      await navigator.clipboard.writeText(pedido.mensajeLink);
      mostrarAviso("Mensaje copiado: pegalo en el chat del cliente.");
    } catch {
      // Sin portapapeles (fuera de https): el texto queda para copiarlo a
      // mano.
      window.prompt("Copiá este mensaje para el cliente:", pedido.mensajeLink);
    }
  }

  const visibles = pedidos.filter((pedido) => pedido.etapa === pestana);
  const pestanaActual = PESTANAS.find((p) => p.etapa === pestana) ?? PESTANAS[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Pedidos online
          </h1>
          <p className="text-sm text-neutral-500">
            Los que entran por la página del local. Al aceptarlos, pasan a
            cocina.
          </p>
        </div>
        {conectado ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            En vivo
          </p>
        ) : (
          <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">
            Reconectando… lo que ves puede no estar al día.
          </p>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Etapas de los pedidos"
        className="flex gap-1 overflow-x-auto rounded-2xl bg-neutral-100 p-1.5"
      >
        {PESTANAS.map((p) => {
          const cantidad = pedidos.filter((pedido) => pedido.etapa === p.etapa)
            .length;
          const activa = p.etapa === pestana;
          const urgente = p.etapa === "nuevo" && cantidad > 0;
          return (
            <button
              key={p.etapa}
              type="button"
              role="tab"
              id={`pestana-${p.etapa}`}
              aria-selected={activa}
              aria-controls="panel-pedidos"
              onClick={() => setPestana(p.etapa)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold whitespace-nowrap transition-colors ${
                activa
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:bg-white/60"
              }`}
            >
              {p.etiqueta}
              <span
                className={`min-w-7 rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${
                  urgente
                    ? "bg-amber-500 text-white"
                    : "bg-neutral-200 text-neutral-700"
                }`}
              >
                {cantidad}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-pedidos"
        aria-labelledby={`pestana-${pestana}`}
      >
        {visibles.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-14 text-center text-base text-neutral-500">
            {pestanaActual.vacio}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibles.map((pedido) => (
              <TarjetaPedido
                key={pedido.id}
                pedido={pedido}
                editando={editando === pedido.id}
                ocupado={ocupado === pedido.id}
                error={errores[pedido.id] ?? null}
                onEditar={() =>
                  setEditando((actual) =>
                    actual === pedido.id ? null : pedido.id,
                  )
                }
                onCambiarCantidad={(item, cantidad) =>
                  ejecutar(pedido, () => cambiarCantidadItem(item.id, cantidad))
                }
                onAceptar={() => {
                  setEditando(null);
                  ejecutar(
                    pedido,
                    () => aceptarPedido(pedido.id),
                    () =>
                      mostrarAviso(
                        `Pedido #${pedido.numero ?? "—"} aceptado: pasó a "En cocina".`,
                      ),
                  );
                }}
                onCancelar={() => setACancelar(pedido)}
                onEntregar={() =>
                  ejecutar(
                    pedido,
                    () => entregarPedido(pedido.id),
                    () =>
                      mostrarAviso(`Pedido #${pedido.numero ?? "—"} entregado.`),
                  )
                }
                onCopiarLink={() => void copiarLink(pedido)}
              />
            ))}
          </div>
        )}
      </div>

      {aCancelar && (
        <DialogoCancelar
          pedido={aCancelar}
          onVolver={() => setACancelar(null)}
          onConfirmar={() => {
            const pedido = aCancelar;
            setACancelar(null);
            setEditando(null);
            ejecutar(
              pedido,
              () => cancelarPedido(pedido.id),
              () =>
                mostrarAviso(
                  pedido.etapa === "nuevo"
                    ? `Pedido #${pedido.numero ?? "—"} rechazado.`
                    : `Pedido #${pedido.numero ?? "—"} cancelado.`,
                ),
            );
          }}
        />
      )}

      <p aria-live="polite" className="sr-only">
        {aviso}
      </p>
      {aviso && (
        <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-40 flex justify-center sm:left-auto">
          <p className="rounded-xl bg-neutral-900 px-5 py-3 text-base font-semibold text-white shadow-lg">
            {aviso}
          </p>
        </div>
      )}
    </div>
  );
}

function TarjetaPedido({
  pedido,
  editando,
  ocupado,
  error,
  onEditar,
  onCambiarCantidad,
  onAceptar,
  onCancelar,
  onEntregar,
  onCopiarLink,
}: {
  pedido: PedidoMostrador;
  editando: boolean;
  ocupado: boolean;
  error: string | null;
  onEditar: () => void;
  onCambiarCantidad: (item: ItemMostrador, cantidad: number) => void;
  onAceptar: () => void;
  onCancelar: () => void;
  onEntregar: () => void;
  onCopiarLink: () => void;
}) {
  const esNuevo = pedido.etapa === "nuevo";
  const esEnvio = pedido.modalidad === "envio";
  const unicoItem = pedido.items.length === 1;

  return (
    <article
      aria-busy={ocupado}
      aria-label={`Pedido ${pedido.numero ?? ""}`}
      className={`flex flex-col rounded-2xl border-2 bg-white p-5 shadow-sm transition-opacity ${
        ocupado ? "opacity-60" : ""
      } ${
        esNuevo
          ? "border-amber-300"
          : pedido.etapa === "listo"
            ? "border-blue-300"
            : "border-neutral-200"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-black tracking-tight text-neutral-900">
            #{pedido.numero ?? "—"}
          </p>
          <p className="mt-0.5 truncate text-lg font-bold text-neutral-800">
            {pedido.clienteNombre}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${
              esEnvio
                ? "bg-violet-100 text-violet-800"
                : "bg-neutral-900 text-white"
            }`}
          >
            {esEnvio ? "Envío" : "Retiro"}
          </span>
          <p className="mt-1.5 text-sm text-neutral-500">
            {TEXTO_TIEMPO[pedido.etapa]} {pedido.hace}
          </p>
        </div>
      </header>

      {esEnvio && pedido.direccion && (
        <p className="mt-2 text-sm text-neutral-700">
          <span className="font-semibold">Envío a:</span> {pedido.direccion}
        </p>
      )}
      {pedido.nota && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
          <span className="font-semibold">Aclaración:</span> {pedido.nota}
        </p>
      )}

      <ul className="mt-4 flex-1 divide-y divide-neutral-100">
        {pedido.items.map((item) => (
          <li key={item.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-neutral-900">
                  {item.cantidad} × {item.nombre}
                </p>
                {item.categoriaNombre && (
                  <p className="text-sm text-neutral-500">
                    {item.categoriaNombre}
                  </p>
                )}
                {item.adicionales.length > 0 && (
                  <p className="text-sm text-neutral-600">
                    Con:{" "}
                    {item.adicionales
                      .map((adicional) => adicional.nombre)
                      .join(", ")}
                  </p>
                )}
                {item.nota && (
                  <p className="text-sm text-neutral-600 italic">
                    “{item.nota}”
                  </p>
                )}
              </div>
              {esNuevo ? (
                <p className="shrink-0 text-base font-semibold text-neutral-700 tabular-nums">
                  {formatearPrecio(item.subtotal)}
                </p>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${ESTADO_ITEM[item.estado].clase}`}
                >
                  {ESTADO_ITEM[item.estado].texto}
                </span>
              )}
            </div>

            {esNuevo && editando && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label={`Cantidad de ${item.nombre}`}
                  className="flex items-center gap-1 rounded-full bg-neutral-100 p-1"
                >
                  <button
                    type="button"
                    onClick={() => onCambiarCantidad(item, item.cantidad - 1)}
                    disabled={ocupado || item.cantidad <= 1}
                    aria-label="Uno menos"
                    className="h-9 w-9 rounded-full bg-white text-lg font-bold text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-base font-bold tabular-nums">
                    {item.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCambiarCantidad(item, item.cantidad + 1)}
                    disabled={ocupado || item.cantidad >= 99}
                    aria-label="Uno más"
                    className="h-9 w-9 rounded-full bg-white text-lg font-bold text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onCambiarCantidad(item, 0)}
                  disabled={ocupado || unicoItem}
                  title={
                    unicoItem
                      ? "Es el único producto: para sacarlo, rechazá el pedido"
                      : undefined
                  }
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:text-neutral-400 disabled:hover:bg-transparent"
                >
                  Quitar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-base font-semibold text-neutral-700">
          {pedido.etapa === "en_cocina"
            ? `${pedido.listos} de ${pedido.items.length} listos`
            : "Total"}
        </span>
        <span className="text-xl font-black text-neutral-900 tabular-nums">
          {formatearPrecio(pedido.total)}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 ring-1 ring-red-200"
        >
          {error}
        </p>
      )}

      <footer className="mt-4 space-y-2">
        {esNuevo && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onEditar}
              disabled={ocupado}
              aria-pressed={editando}
              className="rounded-xl px-3 py-3 text-base font-semibold text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
            >
              {editando ? "Listo" : "Editar"}
            </button>
            <button
              type="button"
              onClick={onCancelar}
              disabled={ocupado}
              className="rounded-xl px-3 py-3 text-base font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-60"
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={onAceptar}
              disabled={ocupado}
              className="rounded-xl bg-green-600 px-3 py-3 text-base font-bold text-white hover:bg-green-700 disabled:opacity-60"
            >
              Aceptar
            </button>
          </div>
        )}

        {pedido.etapa === "listo" && (
          <button
            type="button"
            onClick={onEntregar}
            disabled={ocupado}
            className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Marcar entregado
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          {pedido.mensajeLink && (
            <button
              type="button"
              onClick={onCopiarLink}
              className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              Copiar link para el cliente
            </button>
          )}
          {!esNuevo && (
            <button
              type="button"
              onClick={onCancelar}
              disabled={ocupado}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

function DialogoCancelar({
  pedido,
  onVolver,
  onConfirmar,
}: {
  pedido: PedidoMostrador;
  onVolver: () => void;
  onConfirmar: () => void;
}) {
  const esNuevo = pedido.etapa === "nuevo";
  const numero = pedido.numero ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-cancelar"
        aria-describedby="texto-cancelar"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="titulo-cancelar" className="text-xl font-bold text-neutral-900">
          {esNuevo ? `¿Rechazar el pedido #${numero}?` : `¿Cancelar el pedido #${numero}?`}
        </h2>
        <p id="texto-cancelar" className="mt-2 text-base text-neutral-600">
          {esNuevo
            ? "No va a llegar a cocina."
            : "Cocina lo deja de ver."}{" "}
          No se puede deshacer.{" "}
          {pedido.clienteNombre
            ? `Avisale a ${pedido.clienteNombre} por WhatsApp.`
            : "Avisale al cliente por WhatsApp."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            // El foco arranca en la opción que no hace nada irreversible.
            autoFocus
            onClick={onVolver}
            className="rounded-xl px-4 py-2.5 text-base font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-base font-bold text-white hover:bg-red-700"
          >
            {esNuevo ? "Sí, rechazar" : "Sí, cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
