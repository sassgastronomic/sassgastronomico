"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { formatearPrecio } from "@/lib/landing/precios";
import {
  LIMITES_PEDIDO,
  validarDireccion,
  validarModalidad,
  validarNombreCliente,
  validarNotaPedido,
} from "@/lib/landing/validacion";
import { enlaceWhatsApp } from "@/lib/landing/whatsapp";
import type { ModalidadPedido } from "@/types/database";

import { enviarPedido, type CampoPedido } from "./actions";
import {
  almacenDatosCliente,
  almacenPedidosRecientes,
  limpiarPedidosVencidos,
  olvidarPedido,
  recordarPedido,
  useAlmacen,
  VIGENCIA_PEDIDO_RECIENTE_MS,
  type DatosCliente,
} from "./almacen-local";
import { ArmazonCarta, CartelNoTomaPedidos } from "./carta/armazon";
import {
  BarraPedido,
  Hoja,
  HojaProducto,
  LineaDelPedido,
  ResumenLineas,
} from "./carta/piezas";
import type { CategoriaCarta, LineaVista } from "./carta/tipos";
import { useCarrito } from "./carta/usar-carrito";
import {
  comportamientoScroll,
  PARAM_ENVIADO,
  PARAM_PRODUCTO,
  PARAM_VER,
  paramsSinVistas,
  useVistas,
} from "./carta/vistas";
import { IconoChat, IconoListo, IconoReloj } from "./iconos";
import { PantallaEnviado } from "./pantalla-enviado";
import { VigilarEstadoLocal } from "./vigilar-estado-local";

// Lo que devuelve enviarPedido cuando sale bien (sin el `ok`).
type PedidoEnviado = {
  numero: number;
  codigo: string;
  link: string;
  mensaje: string;
};

const ORDEN_CAMPOS: CampoPedido[] = ["modalidad", "direccion", "nombre", "nota"];

function numeroDePedido(texto: string | null): number | null {
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Landing pública de take away (/{slug}): la primera pantalla del sistema
 * que ve un cliente del local. La carta, el carrito y la navegación son
 * los mismos que en el pedido por QR de mesa (/{slug}/mesa) — ver
 * ./carta/. Lo propio de acá es el final: qué datos se le piden al cliente
 * y qué pasa al confirmar.
 *
 * El contacto con el cliente es WhatsApp (no se le pide teléfono): al
 * confirmar se crea el pedido, y la pantalla que sigue tiene el botón
 * —un enlace de verdad— con el que el cliente le manda el pedido al
 * local. Ahí mismo se le muestra el link de seguimiento (que además va en
 * el mensaje), para que lo guarde.
 */
export function Landing({
  slug,
  comercio,
  categorias,
  tomandoPedidos,
  leidaEn,
}: {
  slug: string;
  comercio: { nombre: string; whatsapp: string };
  categorias: CategoriaCarta[];
  // Con la caja del local cerrada: se ve la carta (para los precios), pero
  // no se puede pedir. crear_pedido_landing lo rechaza igual. Se mantiene
  // al día solo, sin recargar (VigilarEstadoLocal).
  tomandoPedidos: boolean;
  // Cuándo se leyó esta carta de la base (reloj del servidor): para no
  // pisarla con un estado del local más viejo (VigilarEstadoLocal).
  leidaEn: number;
}) {
  const searchParams = useSearchParams();
  const carrito = useCarrito({ slug, categorias, tomandoPedidos });
  const { abrirVista, reemplazarVista, volverUnPaso, volverALaCarta } =
    useVistas();

  const almacenDeDatos = useMemo(() => almacenDatosCliente(slug), [slug]);
  const almacenDePedidos = useMemo(() => almacenPedidosRecientes(slug), [slug]);
  const datosGuardados = useAlmacen(almacenDeDatos);
  const pedidosRecientes = useAlmacen(almacenDePedidos);
  const pedidoReciente = pedidosRecientes[0] ?? null;

  // El aviso "Tu pedido #N" vive de lo guardado en el celular: la landing
  // no le pregunta al servidor cómo va (la abren muchos clientes a la vez,
  // y consultar desde cada uno sería tráfico que se multiplica sin aportar
  // nada; para mirar el estado está el seguimiento). Se va cuando el
  // cliente ve en el seguimiento que el pedido se cerró
  // (pedido/[codigo]/olvidar-pedido.tsx), o solo, cuando se cumple
  // VIGENCIA_PEDIDO_RECIENTE_MS desde que lo hizo — también con la landing
  // abierta, con un temporizador local, sin red.
  const codigoReciente = pedidoReciente?.codigo ?? null;
  const creadoReciente = pedidoReciente?.creadoEn ?? null;

  useEffect(() => {
    limpiarPedidosVencidos(slug);
  }, [slug]);

  useEffect(() => {
    if (!codigoReciente || creadoReciente === null) return;
    const codigo = codigoReciente;
    const temporizador = setTimeout(
      () => olvidarPedido(slug, codigo),
      Math.max(0, creadoReciente + VIGENCIA_PEDIDO_RECIENTE_MS - Date.now()),
    );
    return () => clearTimeout(temporizador);
  }, [slug, codigoReciente, creadoReciente]);

  // --- Vistas ----------------------------------------------------------

  // Sin tomar pedidos no se abre ninguna hoja de pedir (aunque la URL las
  // traiga): solo la pantalla de "pedido enviado", para quien vuelve.
  const productoAbiertoId = tomandoPedidos
    ? searchParams.get(PARAM_PRODUCTO)
    : null;
  const productoAbierto = productoAbiertoId
    ? (carrito.productosPorId.get(productoAbiertoId) ?? null)
    : null;
  const ver = searchParams.get(PARAM_VER);
  const pedidoAbierto =
    tomandoPedidos &&
    !productoAbierto &&
    (ver === "pedido" || ver === "confirmar");
  const confirmando = pedidoAbierto && ver === "confirmar";
  const numeroEnviado = numeroDePedido(searchParams.get(PARAM_ENVIADO));
  const enviadoAbierto =
    !productoAbierto && !pedidoAbierto && numeroEnviado !== null;
  const hojaAbierta = productoAbierto !== null || pedidoAbierto || enviadoAbierto;

  const cerrarVistaActual = useCallback(() => {
    const destino = paramsSinVistas();
    // De la confirmación se vuelve a la hoja del pedido, no a la carta.
    if (new URLSearchParams(window.location.search).get(PARAM_VER) === "confirmar") {
      destino.set(PARAM_VER, "pedido");
    }
    volverUnPaso(destino);
  }, [volverUnPaso]);

  // Con una vista abierta: la página de atrás no se desplaza, y Escape
  // (teclado, en compu) la cierra.
  useEffect(() => {
    if (!hojaAbierta) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function alApretarTecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      if (enviadoAbierto) volverALaCarta();
      else cerrarVistaActual();
    }
    window.addEventListener("keydown", alApretarTecla);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", alApretarTecla);
    };
  }, [hojaAbierta, enviadoAbierto, cerrarVistaActual, volverALaCarta]);

  // --- Pedido enviado -----------------------------------------------

  function alEnviarPedido(resultado: PedidoEnviado, datos: DatosCliente) {
    recordarPedido(slug, {
      numero: resultado.numero,
      codigo: resultado.codigo,
      link: resultado.link,
      mensaje: resultado.mensaje,
      creadoEn: Date.now(),
    });
    almacenDeDatos.guardar(datos);
    carrito.vaciar();
    // La confirmación pasa a ser la pantalla de "pedido enviado": misma
    // entrada del historial y misma profundidad, así "Volver a la carta"
    // sabe cuánto retroceder.
    reemplazarVista(PARAM_ENVIADO, String(resultado.numero));
    // Y ahí termina lo que hace el código: el mensaje al local lo manda el
    // cliente tocando el botón de esa pantalla, que es un enlace de
    // verdad (ver pantalla-enviado.tsx). No se abre WhatsApp por código:
    // es lo que hacía que iOS preguntara antes de abrirlo.
  }

  return (
    <>
      <ArmazonCarta
        titulo={comercio.nombre}
        subtitulo={
          tomandoPedidos
            ? "Elegí lo que quieras y hacé tu pedido para retirar o con envío."
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
                Podés mirar la carta igual; volvé a pasar más tarde para pedir.
              </p>
            )}
            {pedidoReciente && (
              <AvisoPedidoReciente
                href={`/${slug}/pedido/${pedidoReciente.codigo}`}
                numero={pedidoReciente.numero}
              />
            )}
          </>
        }
        carrito={carrito}
        tomandoPedidos={tomandoPedidos}
        hojaAbierta={hojaAbierta}
        pieCarta={
          <>
            <a
              href={enlaceWhatsApp(comercio.whatsapp, "¡Hola! Tengo una consulta.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-neutral-700 ring-1 ring-neutral-300 active:bg-neutral-100"
            >
              <IconoChat className="h-5 w-5" />
              ¿Dudas? Escribile al local
            </a>
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
        <HojaPedido
          slug={slug}
          lineas={carrito.lineas}
          total={carrito.total}
          lineasNoDisponibles={carrito.lineasNoDisponibles}
          datosIniciales={datosGuardados}
          confirmando={confirmando}
          onAbrirConfirmacion={() => abrirVista(PARAM_VER, "confirmar")}
          onCerrarConfirmacion={cerrarVistaActual}
          onProductosNoDisponibles={carrito.marcarNoDisponibles}
          onCambiarCantidad={carrito.cambiarCantidad}
          onQuitar={carrito.quitar}
          onEnviado={alEnviarPedido}
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

      {enviadoAbierto && numeroEnviado !== null && (
        <PantallaEnviado
          slug={slug}
          comercio={comercio}
          numero={numeroEnviado}
          pedido={
            pedidosRecientes.find((pedido) => pedido.numero === numeroEnviado) ??
            null
          }
          nombreCliente={datosGuardados.nombre}
          onVolverALaCarta={volverALaCarta}
        />
      )}
    </>
  );
}

// "Tu pedido #N" arriba de la carta, mientras el celular tenga un pedido
// guardado. Siempre con el mismo texto: la landing no sabe cómo va el
// pedido (no lo consulta), así que solo lleva al seguimiento.
function AvisoPedidoReciente({
  href,
  numero,
}: {
  href: string;
  numero: number;
}) {
  return (
    <Link
      href={href}
      className="mt-5 flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-200 active:bg-amber-100"
    >
      <IconoReloj className="h-6 w-6 shrink-0 text-amber-700" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-amber-950">
          Tu pedido #{numero}
        </span>
        <span className="block text-sm text-amber-800">
          Tocá para ver cómo va
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-amber-700">
        →
      </span>
    </Link>
  );
}

function CampoTexto({
  id,
  etiqueta,
  ayuda,
  error,
  refCampo,
  ...props
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string;
  refCampo: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "className">) {
  const idAyuda = `${id}-ayuda`;
  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold">
        {etiqueta}
      </label>
      {ayuda && (
        <p id={idAyuda} className="text-sm text-neutral-500">
          {ayuda}
        </p>
      )}
      <input
        ref={refCampo}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ayuda ? idAyuda : undefined}
        aria-errormessage={error ? `${id}-error` : undefined}
        className={`mt-2 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400 ${
          error
            ? "border-red-500 focus:border-red-600"
            : "border-neutral-200 focus:border-neutral-900"
        }`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * El pedido antes de mandarlo: lo que lleva, cómo lo recibe y a nombre de
 * quién. Sin teléfono: el contacto es el chat de WhatsApp que se abre al
 * confirmar. "Revisar pedido" no manda nada todavía: abre la confirmación
 * (`confirmando`, que también es parte de la URL), y recién ahí se crea.
 */
function HojaPedido({
  slug,
  lineas,
  total,
  lineasNoDisponibles,
  datosIniciales,
  confirmando,
  onAbrirConfirmacion,
  onCerrarConfirmacion,
  onProductosNoDisponibles,
  onCambiarCantidad,
  onQuitar,
  onEnviado,
  onCerrar,
}: {
  slug: string;
  lineas: LineaVista[];
  total: number;
  lineasNoDisponibles: number;
  datosIniciales: DatosCliente;
  confirmando: boolean;
  onAbrirConfirmacion: () => void;
  onCerrarConfirmacion: () => void;
  onProductosNoDisponibles: (ids: string[]) => void;
  onCambiarCantidad: (clave: string, delta: number) => void;
  onQuitar: (clave: string) => void;
  onEnviado: (resultado: PedidoEnviado, datos: DatosCliente) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const [modalidad, setModalidad] = useState<ModalidadPedido | null>(
    datosIniciales.modalidad,
  );
  const [direccion, setDireccion] = useState(datosIniciales.direccion);
  const [nombre, setNombre] = useState(datosIniciales.nombre);
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Partial<Record<CampoPedido, string>>>(
    {},
  );
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const refModalidad = useRef<HTMLInputElement>(null);
  const refDireccion = useRef<HTMLInputElement>(null);
  const refNombre = useRef<HTMLInputElement>(null);
  const refNota = useRef<HTMLTextAreaElement>(null);

  // Validación en vivo: decide si la confirmación se puede mostrar (por
  // ejemplo, al recargar con ?ver=confirmar y el formulario vacío, se ve
  // la hoja). En pantalla, los errores aparecen recién al tocar "Revisar".
  const validaciones: [CampoPedido, string | null][] = [
    ["modalidad", validarModalidad(modalidad)],
    ["direccion", validarDireccion(direccion, modalidad)],
    ["nombre", validarNombreCliente(nombre)],
    ["nota", validarNotaPedido(nota)],
  ];
  const formularioValido = validaciones.every(([, error]) => error === null);
  const bloqueado = lineas.length === 0 || lineasNoDisponibles > 0;
  const mostrarConfirmacion =
    enviado || (confirmando && formularioValido && !bloqueado);

  function enfocar(campo: CampoPedido) {
    const refs: Record<
      CampoPedido,
      React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
    > = {
      modalidad: refModalidad,
      direccion: refDireccion,
      nombre: refNombre,
      nota: refNota,
    };
    const elemento = refs[campo].current;
    elemento?.focus({ preventScroll: true });
    elemento?.scrollIntoView({ behavior: comportamientoScroll(), block: "center" });
  }

  function limpiarError(campo: CampoPedido) {
    setErrores((actuales) => {
      if (!actuales[campo]) return actuales;
      const siguientes = { ...actuales };
      delete siguientes[campo];
      return siguientes;
    });
  }

  function revisar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (bloqueado) return;

    const encontrados: Partial<Record<CampoPedido, string>> = {};
    for (const [campo, error] of validaciones) {
      if (error) encontrados[campo] = error;
    }
    setErrores(encontrados);
    setErrorEnvio(null);
    const primero = ORDEN_CAMPOS.find((campo) => encontrados[campo]);
    if (primero) {
      enfocar(primero);
      return;
    }
    // Si la URL ya dice "confirmar" (se recargó con el formulario a medio
    // llenar), la confirmación aparece sola ahora que está todo completo.
    if (!confirmando) onAbrirConfirmacion();
  }

  function confirmar() {
    if (pendiente || enviado || bloqueado || !formularioValido || !modalidad) {
      return;
    }
    setErrorEnvio(null);

    iniciarTransicion(async () => {
      const resultado = await enviarPedido(slug, {
        nombre,
        modalidad,
        direccion,
        nota,
        items: lineas.map((linea) => ({
          productoId: linea.productoId,
          cantidad: linea.cantidad,
          nota: linea.nota,
          adicionales: linea.adicionales.map((adicional) => adicional.id),
        })),
      });

      if (resultado.ok) {
        setEnviado(true);
        onEnviado(resultado, {
          nombre: nombre.trim(),
          modalidad,
          direccion: direccion.trim(),
        });
        return;
      }

      setErrorEnvio(resultado.error);
      // El local dejó de tomar pedidos: la página entera pasa a ser el
      // aviso. (Solo acá se recarga: recargar y volver atrás a la vez se
      // pisan en el historial.)
      if (resultado.recargarPagina) {
        router.refresh();
        return;
      }
      // Lo que hay que corregir está en la hoja (algo que se quedó sin
      // stock, o un campo): se cierra la confirmación para verlo.
      if (resultado.noDisponibles) {
        onProductosNoDisponibles(resultado.noDisponibles);
        onCerrarConfirmacion();
        return;
      }
      if (resultado.campo) {
        onCerrarConfirmacion();
        setErrores({ [resultado.campo]: resultado.error });
        enfocar(resultado.campo);
      }
      // Cualquier otro error (sin conexión, por ejemplo): queda en la
      // confirmación, con el aviso, para reintentar.
    });
  }

  return (
    <Hoja
      etiqueta="Tu pedido"
      textoVolver="Seguir eligiendo"
      onCerrar={onCerrar}
      pie={
        <>
          {errorEnvio && !mostrarConfirmacion && (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800 ring-1 ring-red-200"
            >
              {errorEnvio}
            </p>
          )}
          <button
            type="submit"
            form="formulario-pedido"
            disabled={bloqueado}
            className={`flex w-full items-center justify-between gap-4 rounded-2xl px-6 py-4 text-lg font-bold text-white disabled:cursor-not-allowed ${
              lineasNoDisponibles > 0
                ? "bg-red-700"
                : "bg-neutral-900 active:bg-neutral-700 disabled:opacity-60"
            }`}
          >
            {lineasNoDisponibles > 0 ? (
              <span className="flex-1 text-center">
                Sacá lo que ya no está disponible
              </span>
            ) : (
              <>
                <span>Revisar pedido</span>
                <span className="tabular-nums">{formatearPrecio(total)}</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form id="formulario-pedido" noValidate onSubmit={revisar}>
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
          <ul className="mt-4 divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200">
            {lineas.map((linea) => (
              <LineaDelPedido
                key={linea.clave}
                linea={linea}
                onCambiarCantidad={(delta) =>
                  onCambiarCantidad(linea.clave, delta)
                }
                onQuitar={() => onQuitar(linea.clave)}
              />
            ))}
          </ul>
        )}

        <fieldset className="mt-8">
          <legend className="text-lg font-bold">¿Cómo lo recibís?</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <OpcionModalidad
              refOpcion={refModalidad}
              valor="retiro"
              titulo="Lo paso a buscar"
              detalle="Retiro en el local"
              elegida={modalidad}
              conError={Boolean(errores.modalidad)}
              onElegir={(valor) => {
                setModalidad(valor);
                limpiarError("modalidad");
                limpiarError("direccion");
              }}
            />
            <OpcionModalidad
              valor="envio"
              titulo="Que me lo traigan"
              detalle="Envío a domicilio"
              elegida={modalidad}
              conError={Boolean(errores.modalidad)}
              onElegir={(valor) => {
                setModalidad(valor);
                limpiarError("modalidad");
              }}
            />
          </div>
          {errores.modalidad && (
            <p className="mt-2 text-sm font-medium text-red-700">
              {errores.modalidad}
            </p>
          )}

          {modalidad === "envio" && (
            <div className="mt-5 space-y-3">
              <CampoTexto
                refCampo={refDireccion}
                id="direccion-envio"
                etiqueta="¿A dónde te lo llevamos?"
                ayuda="Calle, número, y piso o depto si hace falta."
                error={errores.direccion}
                autoComplete="street-address"
                maxLength={LIMITES_PEDIDO.direccion}
                value={direccion}
                onChange={(evento) => {
                  setDireccion(evento.target.value);
                  limpiarError("direccion");
                }}
              />
              <p className="rounded-2xl bg-amber-50 px-4 py-3.5 text-base text-amber-950 ring-1 ring-amber-200">
                <strong className="font-semibold">
                  El envío no está incluido en el total.
                </strong>{" "}
                Su costo lo arreglás directamente con el local.
              </p>
            </div>
          )}
        </fieldset>

        <div className="mt-8">
          <CampoTexto
            refCampo={refNombre}
            id="nombre-cliente"
            etiqueta="¿A nombre de quién?"
            ayuda="Para que el local sepa de quién es el pedido."
            error={errores.nombre}
            autoComplete="name"
            autoCapitalize="words"
            maxLength={LIMITES_PEDIDO.nombre}
            placeholder="Tu nombre"
            value={nombre}
            onChange={(evento) => {
              setNombre(evento.target.value);
              limpiarError("nombre");
            }}
          />
        </div>

        <div className="mt-8">
          <label htmlFor="nota-pedido" className="text-lg font-bold">
            ¿Algo más que el local tenga que saber?
          </label>
          <p className="text-sm text-neutral-500">
            Opcional. Ej: &quot;tocar el timbre 2B&quot;, &quot;sin
            cubiertos&quot;.
          </p>
          <textarea
            ref={refNota}
            id="nota-pedido"
            rows={2}
            maxLength={LIMITES_PEDIDO.nota}
            value={nota}
            onChange={(evento) => {
              setNota(evento.target.value);
              limpiarError("nota");
            }}
            className="mt-3 w-full resize-none rounded-2xl border-2 border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none focus:border-neutral-900"
          />
          {errores.nota && (
            <p className="mt-1.5 text-sm font-medium text-red-700">
              {errores.nota}
            </p>
          )}
        </div>
      </form>

      {mostrarConfirmacion && (
        <ConfirmacionPedido
          lineas={lineas}
          total={total}
          modalidad={modalidad}
          direccion={direccion}
          nombre={nombre}
          nota={nota}
          pendiente={pendiente}
          enviado={enviado}
          errorEnvio={errorEnvio}
          onConfirmar={confirmar}
          onVolver={onCerrarConfirmacion}
        />
      )}
    </Hoja>
  );
}

/**
 * Último paso antes de crear el pedido: el resumen completo y el total,
 * para revisarlo con calma. Al confirmar se crea el pedido y aparece la
 * pantalla de enviado, donde el cliente toca el botón que se lo manda al
 * local por WhatsApp.
 */
function ConfirmacionPedido({
  lineas,
  total,
  modalidad,
  direccion,
  nombre,
  nota,
  pendiente,
  enviado,
  errorEnvio,
  onConfirmar,
  onVolver,
}: {
  lineas: LineaVista[];
  total: number;
  modalidad: ModalidadPedido | null;
  direccion: string;
  nombre: string;
  nota: string;
  pendiente: boolean;
  enviado: boolean;
  errorEnvio: string | null;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const esEnvio = modalidad === "envio";

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center bg-neutral-950/50 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmacion"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        {enviado ? (
          <div
            aria-live="polite"
            className="flex flex-col items-center px-6 pt-14 pb-[max(3.5rem,env(safe-area-inset-bottom))] text-center"
          >
            {/* Lo que se ve el instante que va de confirmar a la pantalla
                de enviado: sin esto volvería a asomar el resumen. */}
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <IconoListo className="h-8 w-8" />
            </span>
            <p id="titulo-confirmacion" className="mt-4 text-2xl font-bold">
              ¡Listo, pedido hecho!
            </p>
            <p className="mt-2 text-base text-pretty text-neutral-600">
              Ahora mandáselo al local por WhatsApp.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-4">
              <h2
                id="titulo-confirmacion"
                className="text-2xl font-bold tracking-tight"
              >
                Revisá tu pedido
              </h2>
              <p className="mt-1 text-base text-pretty text-neutral-600">
                Si está todo bien, confirmalo: después se lo mandás al local
                por WhatsApp, con el pedido ya escrito.
              </p>

              <div className="mt-5">
                <ResumenLineas lineas={lineas} />
              </div>

              <dl className="mt-4 space-y-3 rounded-2xl bg-neutral-50 px-4 py-4 text-base">
                <div>
                  <dt className="text-sm text-neutral-500">A nombre de</dt>
                  <dd className="font-medium">{nombre.trim()}</dd>
                </div>
                <div>
                  <dt className="text-sm text-neutral-500">Entrega</dt>
                  <dd className="font-medium">
                    {esEnvio
                      ? `Envío a ${direccion.trim()}`
                      : "Lo pasás a buscar por el local"}
                  </dd>
                </div>
                {nota.trim() && (
                  <div>
                    <dt className="text-sm text-neutral-500">Aclaración</dt>
                    <dd className="font-medium">{nota.trim()}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 flex items-baseline justify-between gap-4 px-1">
                <span className="text-lg font-bold">Total</span>
                <span className="text-2xl font-black tabular-nums">
                  {formatearPrecio(total)}
                </span>
              </div>
              {esEnvio && (
                <p className="mt-1 px-1 text-sm text-neutral-600">
                  Más el envío, que arreglás con el local.
                </p>
              )}
              <p className="mt-3 px-1 text-sm text-neutral-600">
                No se paga online: el pago lo arreglás con el local.
              </p>
              <p className="mt-1 px-1 text-xs text-neutral-500">
                Documento no válido como factura.
              </p>
            </div>

            <div className="shrink-0 space-y-2 border-t border-neutral-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {errorEnvio && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800 ring-1 ring-red-200"
                >
                  {errorEnvio}
                </p>
              )}
              <button
                type="button"
                onClick={onConfirmar}
                disabled={pendiente}
                className="w-full rounded-2xl bg-green-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-green-600/20 active:bg-green-700 disabled:opacity-60"
              >
                {pendiente ? "Confirmando tu pedido…" : "Confirmar pedido"}
              </button>
              <button
                type="button"
                // El foco arranca en la opción que no hace nada irreversible.
                autoFocus
                onClick={onVolver}
                disabled={pendiente}
                className="w-full rounded-2xl px-6 py-3.5 text-base font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-60"
              >
                Volver y cambiar algo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OpcionModalidad({
  refOpcion,
  valor,
  titulo,
  detalle,
  elegida,
  conError,
  onElegir,
}: {
  refOpcion?: React.Ref<HTMLInputElement>;
  valor: ModalidadPedido;
  titulo: string;
  detalle: string;
  elegida: ModalidadPedido | null;
  conError: boolean;
  onElegir: (valor: ModalidadPedido) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col rounded-2xl border-2 px-4 py-4 has-checked:border-neutral-900 has-checked:bg-neutral-900 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-neutral-900 has-focus-visible:ring-offset-2 ${
        conError ? "border-red-500" : "border-neutral-200"
      }`}
    >
      <input
        ref={refOpcion}
        type="radio"
        name="modalidad"
        value={valor}
        checked={elegida === valor}
        onChange={() => onElegir(valor)}
        className="sr-only"
      />
      <span className="text-base font-bold">{titulo}</span>
      <span className="mt-0.5 text-sm opacity-75">{detalle}</span>
    </label>
  );
}
