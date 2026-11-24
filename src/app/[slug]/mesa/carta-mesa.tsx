"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { formatearPrecio } from "@/lib/landing/precios";

import {
  almacenBorradorQr,
  useAlmacen,
  type LineaBorrador,
} from "../almacen-local";
import { ArmazonCarta, CartelNoTomaPedidos } from "../carta/armazon";
import {
  BarraPedido,
  Hoja,
  HojaProducto,
  LineaDelPedido,
} from "../carta/piezas";
import type { CategoriaCarta, LineaVista } from "../carta/tipos";
import { useCarrito, type Carrito } from "../carta/usar-carrito";
import {
  PARAM_PRODUCTO,
  PARAM_QR,
  PARAM_VER,
  paramsSinVistas,
  useVistas,
} from "../carta/vistas";
import { IconoReloj } from "../iconos";
import { VigilarEstadoLocal } from "../vigilar-estado-local";
import { crearBorradorMesa, type ResultadoBorradorQr } from "./actions";
import { PantallaQr } from "./pantalla-qr";
import { useRestante } from "./vencimiento";

/**
 * Pedido desde la mesa con el QR impreso (/{slug}/mesa).
 *
 * La carta, el carrito y la navegación son exactamente los de la landing
 * de take away (ver ../carta/): el cliente es el mismo y no tiene por qué
 * aprender dos pantallas. Lo que cambia es todo lo de alrededor del
 * pedido:
 *
 * - **No se le pide nada.** Ni nombre, ni teléfono, ni cómo lo recibe:
 *   está sentado en una mesa y el mozo lo tiene adelante. Armar el pedido
 *   es lo único que tiene que hacer.
 * - **Confirmar no crea un pedido**, crea un borrador que vale 30 minutos
 *   y no vale nada hasta que un mozo lo escanea. Por eso alcanza un solo
 *   paso de confirmación (la hoja del pedido ya es la revisión) en vez de
 *   los dos de la landing: acá nada es irreversible todavía.
 * - **Lo que sigue es el QR**, que el cliente le muestra al mozo.
 */
export function CartaMesa({
  slug,
  comercio,
  categorias,
  tomandoPedidos,
  leidaEn,
}: {
  slug: string;
  comercio: { nombre: string };
  categorias: CategoriaCarta[];
  // Con la caja del local cerrada: se ve la carta (para los precios), pero
  // no se puede pedir. crear_borrador_qr lo rechaza igual. Se mantiene al
  // día solo, sin recargar (VigilarEstadoLocal).
  tomandoPedidos: boolean;
  // Cuándo se leyó esta carta de la base (reloj del servidor): para no
  // pisarla con un estado del local más viejo (VigilarEstadoLocal).
  leidaEn: number;
}) {
  const searchParams = useSearchParams();
  const carrito = useCarrito({ slug, categorias, tomandoPedidos });
  const { abrirVista, reemplazarVista, volverUnPaso, volverALaCarta } =
    useVistas();

  const almacenDelBorrador = useMemo(() => almacenBorradorQr(slug), [slug]);
  const borrador = useAlmacen(almacenDelBorrador);

  // --- Vistas ----------------------------------------------------------

  // Sin tomar pedidos no se abre ninguna hoja de pedir (aunque la URL las
  // traiga): solo el QR, para quien vuelve a buscarlo.
  const productoAbiertoId = tomandoPedidos
    ? searchParams.get(PARAM_PRODUCTO)
    : null;
  const productoAbierto = productoAbiertoId
    ? (carrito.productosPorId.get(productoAbiertoId) ?? null)
    : null;
  const pedidoAbierto =
    tomandoPedidos && !productoAbierto && searchParams.get(PARAM_VER) === "pedido";
  // Si no hay borrador guardado, el parámetro se ignora y se ve la carta:
  // pasa con el celular de otra persona o con el almacenamiento borrado, y
  // no hay nada que mostrar.
  const qrAbierto =
    !productoAbierto &&
    !pedidoAbierto &&
    searchParams.get(PARAM_QR) === "1" &&
    borrador !== null;
  const hojaAbierta = productoAbierto !== null || pedidoAbierto || qrAbierto;

  const cerrarVistaActual = useCallback(() => {
    volverUnPaso(paramsSinVistas());
  }, [volverUnPaso]);

  // Con una vista abierta: la página de atrás no se desplaza, y Escape
  // (teclado, en compu) la cierra.
  useEffect(() => {
    if (!hojaAbierta) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function alApretarTecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      if (qrAbierto) volverALaCarta();
      else cerrarVistaActual();
    }
    window.addEventListener("keydown", alApretarTecla);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", alApretarTecla);
    };
  }, [hojaAbierta, qrAbierto, cerrarVistaActual, volverALaCarta]);

  // --- El código ya armado ---------------------------------------------

  // Un solo reloj para las dos pantallas que lo miran: el aviso de arriba
  // de la carta y la pantalla del QR. Al llegar a cero el borrador **no**
  // se borra: la pantalla del QR lo necesita para poder decir "tu código
  // venció" y devolverle el pedido al carrito, que quedó vacío al
  // confirmar. Lo borra el cliente al armarlo de nuevo, o la gracia de
  // ../almacen-local.ts si nunca vuelve.
  const restante = useRestante(borrador?.venceEn ?? null);
  const vencido = borrador !== null && restante <= 0;

  function alArmarBorrador(
    resultado: Extract<ResultadoBorradorQr, { ok: true }>,
    lineas: LineaBorrador[],
    total: number,
  ) {
    almacenDelBorrador.guardar({
      codigo: resultado.codigo,
      link: resultado.link,
      venceEn: resultado.venceEn,
      lineas,
      total,
    });
    // El carrito se vacía: lo que el cliente pidió ya quedó fijo en el
    // borrador, y dejarlo lleno haría que la carta y el QR muestren cosas
    // distintas. La foto de las líneas queda guardada con el código, así
    // que la pantalla del QR sigue mostrando lo que el QR contiene.
    carrito.vaciar();
    // La hoja del pedido pasa a ser la pantalla del QR: misma entrada del
    // historial y misma profundidad, así "Volver a la carta" sabe cuánto
    // retroceder.
    reemplazarVista(PARAM_QR, "1");
  }

  function empezarDeNuevo() {
    if (!borrador) return;
    const noReponibles = carrito.reponer(borrador.lineas);
    almacenDelBorrador.guardar(null);
    volverALaCarta();
    carrito.mostrarAviso(
      noReponibles > 0
        ? "Te devolvimos tu pedido, menos lo que ya no está"
        : "Te devolvimos tu pedido: confirmalo de nuevo",
    );
  }

  return (
    <>
      <ArmazonCarta
        titulo={comercio.nombre}
        subtitulo={
          tomandoPedidos
            ? "Armá tu pedido acá y después mostrale el código al mozo."
            : "Mirá la carta y los precios."
        }
        encabezado={
          <>
            {!tomandoPedidos && (
              <p
                role="status"
                className="mt-5 rounded-2xl bg-amber-50 px-4 py-3.5 text-base text-pretty text-amber-950 ring-1 ring-amber-200"
              >
                <strong className="font-semibold">
                  Ahora no estamos tomando pedidos.
                </strong>{" "}
                Podés mirar la carta igual; para pedir, llamá al mozo.
              </p>
            )}
            {borrador && (
              <button
                type="button"
                onClick={() => abrirVista(PARAM_QR, "1")}
                className={`mt-5 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 ${
                  vencido
                    ? "bg-neutral-100 ring-neutral-300 active:bg-neutral-200"
                    : "bg-amber-50 ring-amber-200 active:bg-amber-100"
                }`}
              >
                <IconoReloj
                  className={`h-6 w-6 shrink-0 ${
                    vencido ? "text-neutral-500" : "text-amber-700"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-semibold ${
                      vencido ? "text-neutral-800" : "text-amber-950"
                    }`}
                  >
                    {vencido ? "Tu código venció" : `Tu código: ${borrador.codigo}`}
                  </span>
                  <span
                    className={`block text-sm ${
                      vencido ? "text-neutral-600" : "text-amber-800"
                    }`}
                  >
                    {vencido
                      ? "Tocá para armar el pedido de nuevo"
                      : "Tocá para mostrárselo al mozo"}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`text-xl ${
                    vencido ? "text-neutral-500" : "text-amber-700"
                  }`}
                >
                  →
                </span>
              </button>
            )}
          </>
        }
        carrito={carrito}
        tomandoPedidos={tomandoPedidos}
        hojaAbierta={hojaAbierta}
        pieCarta={
          <>
            <p>Para pedir no hace falta instalar nada ni dar tus datos.</p>
            <p>No se paga online: el pago lo arreglás con el local.</p>
          </>
        }
        barraInferior={
          tomandoPedidos ? (
            <BarraPedido
              unidades={carrito.unidades}
              total={carrito.total}
              hayNoDisponibles={carrito.lineasNoDisponibles > 0}
              textoVacio="Tu pedido"
              textoAbrir="Ver mi pedido"
              onAbrir={() => abrirVista(PARAM_VER, "pedido")}
            />
          ) : (
            <CartelNoTomaPedidos texto="Ahora no se están tomando pedidos" />
          )
        }
        onElegirProducto={(productoId) => abrirVista(PARAM_PRODUCTO, productoId)}
      />

      {productoAbierto && (
        <HojaProducto
          key={productoAbierto.id}
          producto={productoAbierto}
          onAgregar={(cantidad, nota, adicionales) => {
            carrito.agregar(productoAbierto, cantidad, nota, adicionales);
            cerrarVistaActual();
          }}
          onCerrar={cerrarVistaActual}
        />
      )}

      {pedidoAbierto && (
        <HojaPedidoMesa
          slug={slug}
          carrito={carrito}
          onArmado={alArmarBorrador}
          onCerrar={cerrarVistaActual}
        />
      )}

      <VigilarEstadoLocal
        slug={slug}
        tomandoPedidos={tomandoPedidos}
        leidaEn={leidaEn}
        pausado={hojaAbierta}
        onSinStock={carrito.alSaberStock}
      />

      {qrAbierto && borrador && (
        <PantallaQr
          nombreComercio={comercio.nombre}
          borrador={borrador}
          restante={restante}
          onVolverALaCarta={volverALaCarta}
          onEmpezarDeNuevo={empezarDeNuevo}
        />
      )}
    </>
  );
}

/** La foto de una línea que se guarda con el código (ver ../almacen-local.ts). */
function aLineaBorrador(linea: LineaVista): LineaBorrador {
  return {
    nombre: linea.nombre,
    categoriaNombre: linea.categoriaNombre,
    cantidad: linea.cantidad,
    nota: linea.nota,
    adicionales: linea.adicionales.map((adicional) => adicional.nombre),
    subtotal: linea.subtotal ?? 0,
    productoId: linea.productoId,
    adicionalesIds: linea.adicionales.map((adicional) => adicional.id),
  };
}

/**
 * El pedido antes de pedirle el código a la base. Es la revisión y la
 * confirmación en una sola pantalla: no hay datos que completar ni nada
 * irreversible del otro lado del botón (el borrador vence solo y no es un
 * pedido), así que un segundo modal de confirmación sería un paso de más.
 */
function HojaPedidoMesa({
  slug,
  carrito,
  onArmado,
  onCerrar,
}: {
  slug: string;
  carrito: Carrito;
  onArmado: (
    resultado: Extract<ResultadoBorradorQr, { ok: true }>,
    lineas: LineaBorrador[],
    total: number,
  ) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { lineas, total, lineasNoDisponibles } = carrito;
  const bloqueado = lineas.length === 0 || lineasNoDisponibles > 0;

  function confirmar() {
    if (pendiente || bloqueado) return;
    setError(null);

    // La foto se arma con las líneas de ahora, antes de la llamada: es lo
    // que el cliente está viendo y lo que se le va a mostrar junto al QR.
    const foto = lineas.map(aLineaBorrador);
    const totalAhora = total;

    iniciarTransicion(async () => {
      const resultado = await crearBorradorMesa(
        slug,
        lineas.map((linea) => ({
          productoId: linea.productoId,
          cantidad: linea.cantidad,
          nota: linea.nota,
          adicionales: linea.adicionales.map((adicional) => adicional.id),
        })),
      );

      if (resultado.ok) {
        onArmado(resultado, foto, totalAhora);
        return;
      }

      setError(resultado.error);
      // El local dejó de tomar pedidos desde la mesa: la página entera
      // pasa a ser el aviso que corresponda.
      if (resultado.recargarPagina) {
        router.refresh();
        return;
      }
      // Algo se quedó sin stock: se marca en rojo en esta misma hoja, que
      // es donde el cliente lo puede sacar.
      if (resultado.noDisponibles) {
        carrito.marcarNoDisponibles(resultado.noDisponibles);
      }
    });
  }

  return (
    <Hoja
      etiqueta="Tu pedido"
      textoVolver="Seguir eligiendo"
      onCerrar={onCerrar}
      pie={
        <>
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800 ring-1 ring-red-200"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={confirmar}
            disabled={bloqueado || pendiente}
            className={`flex w-full items-center justify-between gap-4 rounded-2xl px-6 py-4 text-lg font-bold text-white disabled:cursor-not-allowed ${
              lineasNoDisponibles > 0
                ? "bg-red-700"
                : "bg-green-600 shadow-lg shadow-green-600/20 active:bg-green-700 disabled:opacity-60"
            }`}
          >
            {lineasNoDisponibles > 0 ? (
              <span className="flex-1 text-center">
                Sacá lo que ya no está disponible
              </span>
            ) : pendiente ? (
              <span className="flex-1 text-center">Armando tu código…</span>
            ) : (
              <>
                <span>Pedir esto</span>
                <span className="tabular-nums">{formatearPrecio(total)}</span>
              </>
            )}
          </button>
        </>
      }
    >
      <h2 className="text-2xl font-bold tracking-tight">Tu pedido</h2>

      {lineas.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-neutral-100 p-5 text-center">
          <p className="text-base text-neutral-600">
            Todavía no agregaste nada.
          </p>
          <button
            type="button"
            onClick={onCerrar}
            className="mt-3 rounded-full bg-neutral-900 px-5 py-3 font-semibold text-white active:bg-neutral-700"
          >
            Ver la carta
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-base text-pretty text-neutral-600">
            Cuando lo confirmes te vamos a dar un código para mostrarle al
            mozo. Tu pedido entra a la cocina cuando él lo escanea.
          </p>

          <ul className="mt-4 divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200">
            {lineas.map((linea) => (
              <LineaDelPedido
                key={linea.clave}
                linea={linea}
                onCambiarCantidad={(delta) =>
                  carrito.cambiarCantidad(linea.clave, delta)
                }
                onQuitar={() => carrito.quitar(linea.clave)}
              />
            ))}
          </ul>

          <div className="mt-5 flex items-baseline justify-between gap-4 px-1">
            <span className="text-lg font-bold">Total</span>
            <span className="text-2xl font-black tabular-nums">
              {formatearPrecio(total)}
            </span>
          </div>
          <p className="mt-2 px-1 text-sm text-neutral-600">
            No se paga online: el pago lo arreglás con el local.
          </p>
          <p className="mt-1 px-1 text-xs text-neutral-500">
            Documento no válido como factura.
          </p>
        </>
      )}
    </Hoja>
  );
}
