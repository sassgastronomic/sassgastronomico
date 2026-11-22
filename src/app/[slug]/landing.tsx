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
  type ReactNode,
} from "react";

import { idLocal } from "@/lib/id-local";
import {
  formatearPrecio,
  subtotalLinea,
  sumarMontos,
} from "@/lib/landing/precios";
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
  almacenCarrito,
  almacenDatosCliente,
  almacenPedidosRecientes,
  limpiarPedidosVencidos,
  olvidarPedido,
  recordarPedido,
  useAlmacen,
  VIGENCIA_PEDIDO_RECIENTE_MS,
  type DatosCliente,
} from "./almacen-local";
import {
  IconoCerrar,
  IconoChat,
  IconoListo,
  IconoMas,
  IconoMenos,
  IconoReloj,
} from "./iconos";
import { PantallaEnviado } from "./pantalla-enviado";
import { VigilarEstadoLocal } from "./vigilar-estado-local";

export type AdicionalLanding = {
  id: string;
  nombre: string;
  precioExtra: number;
};

export type ProductoLanding = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  descripcion: string | null;
  precio: number;
  sinStock: boolean;
  adicionales: AdicionalLanding[];
};

export type CategoriaLanding = {
  id: string;
  nombre: string;
  productos: ProductoLanding[];
};

// Lo que devuelve enviarPedido cuando sale bien (sin el `ok`).
type PedidoEnviado = {
  numero: number;
  codigo: string;
  link: string;
  mensaje: string;
};

// Una línea del carrito tal como se muestra: nombre, precio y adicionales
// salen de la carta actual, no de lo guardado en el celular. Si el
// producto ya no se puede pedir, `subtotal` es null y `motivo` dice por
// qué (no se saca solo: el cliente tiene que enterarse).
type LineaVista = {
  clave: string;
  productoId: string;
  nombre: string;
  categoriaNombre: string | null;
  cantidad: number;
  nota: string;
  adicionales: AdicionalLanding[];
  subtotal: number | null;
  motivo: string | null;
};

// Las vistas de la landing son parte de la URL, con history.pushState:
// ?producto=… (la hoja de un producto), ?ver=pedido (la hoja del pedido),
// ?ver=confirmar (la confirmación, arriba de la hoja del pedido) y
// ?enviado=N (la pantalla de después de enviarlo). Así el "atrás" del
// celular — o el gesto de deslizar en iPhone — cierra la vista en vez de
// sacar al cliente de la página, que es lo que haría cualquiera que no
// conoce la pantalla.
const PARAM_PRODUCTO = "producto";
const PARAM_VER = "ver";
const PARAM_ENVIADO = "enviado";

// Cuántas vistas propias de la landing hay en el historial hasta la carta
// (1 = una hoja; 2 = la confirmación arriba de la hoja del pedido). Va en
// history.state, que Next conserva al ir y volver con el navegador.
const CLAVE_PROFUNDIDAD = "profundidadLanding";

const ORDEN_CAMPOS: CampoPedido[] = ["modalidad", "direccion", "nombre", "nota"];

function idSeccion(categoriaId: string): string {
  return `categoria-${categoriaId}`;
}

function comportamientoScroll(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function profundidadActual(): number {
  const estado: unknown = window.history.state;
  if (typeof estado !== "object" || estado === null) return 0;
  const valor: unknown = Reflect.get(estado, CLAVE_PROFUNDIDAD);
  return typeof valor === "number" && valor > 0 ? valor : 0;
}

// Los parámetros de la URL actual, sin los de las vistas de la landing.
function paramsSinVistas(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  params.delete(PARAM_PRODUCTO);
  params.delete(PARAM_VER);
  params.delete(PARAM_ENVIADO);
  return params;
}

function urlDe(params: URLSearchParams): string {
  const texto = params.toString();
  return texto ? `?${texto}` : window.location.pathname;
}

function mismosIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function numeroDePedido(texto: string | null): number | null {
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Landing pública de take away (/{slug}): la primera pantalla del sistema
 * que ve un cliente del local. La usa gente de cualquier edad, desde el
 * celular, sin cuenta y sin explicación. Por eso:
 *
 * - Se explora por categorías (todas a la vista, una debajo de otra, con
 *   una barra para saltar entre ellas), no con un buscador: el cliente no
 *   conoce la carta y quiere ver qué hay.
 * - Un producto se toca entero (no un "+" chiquito) y se personaliza en
 *   una hoja de pantalla completa: adicionales, aclaración, cantidad.
 * - El pedido siempre está a la vista abajo, con el total.
 * - Lo que el cliente arma o escribe no se pierde (ver almacen-local.ts).
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
  categorias: CategoriaLanding[];
  // Con la caja del local cerrada: se ve la carta (para los precios), pero
  // no se puede pedir. crear_pedido_landing lo rechaza igual. Se mantiene
  // al día solo, sin recargar (VigilarEstadoLocal).
  tomandoPedidos: boolean;
  // Cuándo se leyó esta carta de la base (reloj del servidor): para no
  // pisarla con un estado del local más viejo (VigilarEstadoLocal).
  leidaEn: number;
}) {
  const searchParams = useSearchParams();

  const almacenDelCarrito = useMemo(() => almacenCarrito(slug), [slug]);
  const almacenDeDatos = useMemo(() => almacenDatosCliente(slug), [slug]);
  const almacenDePedidos = useMemo(() => almacenPedidosRecientes(slug), [slug]);
  const carrito = useAlmacen(almacenDelCarrito);
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

  // Productos que el servidor dijo que ya no se pueden pedir (al intentar
  // mandar el pedido) aunque la carta de esta página todavía no lo sepa: se
  // muestran como sin stock. Valen solo para la carta con la que se
  // marcaron; si la página trae una carta nueva, ya viene al día.
  const [apagados, setApagados] = useState<{
    carta: CategoriaLanding[];
    ids: ReadonlySet<string>;
  } | null>(null);
  const idsApagados =
    apagados && apagados.carta === categorias ? apagados.ids : null;

  // Lo que está sin stock según el estado del local que la landing va
  // consultando (VigilarEstadoLocal), más nuevo que esta carta: lo que la
  // cocina o el mostrador marcan mientras el cliente mira. Vale para esta
  // carta; si la página trae una nueva, ya viene al día.
  const [stockAlDia, setStockAlDia] = useState<{
    carta: CategoriaLanding[];
    sinStock: ReadonlySet<string>;
  } | null>(null);
  const sinStockAlDia =
    stockAlDia && stockAlDia.carta === categorias ? stockAlDia.sinStock : null;

  function alSaberStock(sinStock: ReadonlySet<string>) {
    setStockAlDia((actual) =>
      actual && actual.carta === categorias && mismosIds(actual.sinStock, sinStock)
        ? actual
        : { carta: categorias, sinStock },
    );
  }

  const categoriasVistas = useMemo(
    () =>
      idsApagados || sinStockAlDia
        ? categorias.map((categoria) => ({
            ...categoria,
            productos: categoria.productos.map((producto) => {
              const sinStock =
                (idsApagados?.has(producto.id) ?? false) ||
                (sinStockAlDia
                  ? sinStockAlDia.has(producto.id)
                  : producto.sinStock);
              return sinStock === producto.sinStock
                ? producto
                : { ...producto, sinStock };
            }),
          }))
        : categorias,
    [categorias, idsApagados, sinStockAlDia],
  );

  function marcarNoDisponibles(ids: string[]) {
    setApagados({
      carta: categorias,
      ids: new Set([...(idsApagados ?? []), ...ids]),
    });
  }

  const productosPorId = useMemo(
    () =>
      new Map(
        categoriasVistas
          .flatMap((categoria) => categoria.productos)
          .map((producto) => [producto.id, producto] as const),
      ),
    [categoriasVistas],
  );

  const lineas = useMemo<LineaVista[]>(
    () =>
      carrito.map((linea) => {
        const producto = productosPorId.get(linea.productoId);
        if (!producto || producto.sinStock) {
          return {
            clave: linea.clave,
            productoId: linea.productoId,
            nombre: producto?.nombre ?? (linea.nombre || "Producto"),
            categoriaNombre: producto?.categoriaNombre ?? null,
            cantidad: linea.cantidad,
            nota: linea.nota,
            adicionales: [],
            subtotal: null,
            motivo: !producto
              ? "Ya no está en la carta"
              : idsApagados?.has(producto.id)
                ? "Ya no está disponible"
                : "Se quedó sin stock",
          };
        }
        // Un adicional que el local dejó de ofrecer no se cobraría (la
        // base lo ignora): tampoco se muestra.
        const adicionales = producto.adicionales.filter((adicional) =>
          linea.adicionales.includes(adicional.id),
        );
        return {
          clave: linea.clave,
          productoId: producto.id,
          nombre: producto.nombre,
          categoriaNombre: producto.categoriaNombre,
          cantidad: linea.cantidad,
          nota: linea.nota,
          adicionales,
          subtotal: subtotalLinea(
            producto.precio,
            adicionales.map((adicional) => adicional.precioExtra),
            linea.cantidad,
          ),
          motivo: null,
        };
      }),
    [carrito, productosPorId, idsApagados],
  );

  const total = sumarMontos(
    lineas.flatMap((linea) => (linea.subtotal === null ? [] : [linea.subtotal])),
  );
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const lineasNoDisponibles = lineas.filter(
    (linea) => linea.subtotal === null,
  ).length;
  const unidadesPorProducto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const linea of carrito) {
      mapa.set(linea.productoId, (mapa.get(linea.productoId) ?? 0) + linea.cantidad);
    }
    return mapa;
  }, [carrito]);

  // --- Vistas ----------------------------------------------------------

  // Sin tomar pedidos no se abre ninguna hoja de pedir (aunque la URL las
  // traiga): solo la pantalla de "pedido enviado", para quien vuelve.
  const productoAbiertoId = tomandoPedidos
    ? searchParams.get(PARAM_PRODUCTO)
    : null;
  const productoAbierto = productoAbiertoId
    ? (productosPorId.get(productoAbiertoId) ?? null)
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

  const abrirVista = useCallback((parametro: string, valor: string) => {
    const params = paramsSinVistas();
    params.set(parametro, valor);
    window.history.pushState(
      { [CLAVE_PROFUNDIDAD]: profundidadActual() + 1 },
      "",
      urlDe(params),
    );
  }, []);

  // Un paso atrás. Si la vista la agregó la landing, es el "atrás" del
  // navegador (queda igual que tocarlo); si se entró con el parámetro ya
  // puesto (un link compartido, una recarga que perdió el historial), se
  // reemplaza la URL por `destino`: "atrás" sacaría al cliente de la página.
  const volverUnPaso = useCallback((destino: URLSearchParams) => {
    if (profundidadActual() > 0) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", urlDe(destino));
  }, []);

  const cerrarVistaActual = useCallback(() => {
    const destino = paramsSinVistas();
    // De la confirmación se vuelve a la hoja del pedido, no a la carta.
    if (new URLSearchParams(window.location.search).get(PARAM_VER) === "confirmar") {
      destino.set(PARAM_VER, "pedido");
    }
    volverUnPaso(destino);
  }, [volverUnPaso]);

  // De la pantalla de "pedido enviado" a la carta, salteando las vistas que
  // quedaron atrás en el historial (la hoja del pedido).
  const volverALaCarta = useCallback(() => {
    const profundidad = profundidadActual();
    if (profundidad > 0) {
      window.history.go(-profundidad);
      return;
    }
    window.history.replaceState(null, "", urlDe(paramsSinVistas()));
  }, []);

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

  // --- Aviso de "agregado" --------------------------------------------

  const [aviso, setAviso] = useState<string | null>(null);
  const refTimerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarAviso(texto: string) {
    if (refTimerAviso.current) clearTimeout(refTimerAviso.current);
    setAviso(texto);
    refTimerAviso.current = setTimeout(() => setAviso(null), 2600);
  }

  // Si el local abre mientras el cliente mira la carta, la página se
  // habilita sola (VigilarEstadoLocal): se le avisa, para que entienda
  // por qué cambió.
  const [tomabaPedidos, setTomabaPedidos] = useState(tomandoPedidos);
  const [recienAbrio, setRecienAbrio] = useState(false);
  if (tomabaPedidos !== tomandoPedidos) {
    setTomabaPedidos(tomandoPedidos);
    setRecienAbrio(tomandoPedidos);
  }
  useEffect(() => {
    if (!recienAbrio) return;
    const temporizador = setTimeout(() => setRecienAbrio(false), 4000);
    return () => clearTimeout(temporizador);
  }, [recienAbrio]);
  const textoAviso =
    aviso ?? (recienAbrio ? "¡Ya estamos tomando pedidos!" : null);

  // --- Carrito ---------------------------------------------------------

  function agregarAlCarrito(
    producto: ProductoLanding,
    cantidad: number,
    nota: string,
    adicionales: string[],
  ) {
    const actual = almacenDelCarrito.leer();
    const notaLimpia = nota.trim();
    const claveAdicionales = [...adicionales].sort().join(",");
    // Lo mismo con lo mismo (mismos adicionales y misma aclaración) suma a
    // la línea que ya está, en vez de repetirla.
    const igual = actual.find(
      (linea) =>
        linea.productoId === producto.id &&
        linea.nota === notaLimpia &&
        [...linea.adicionales].sort().join(",") === claveAdicionales,
    );

    if (igual) {
      almacenDelCarrito.guardar(
        actual.map((linea) =>
          linea === igual
            ? {
                ...linea,
                cantidad: Math.min(
                  LIMITES_PEDIDO.cantidad,
                  linea.cantidad + cantidad,
                ),
              }
            : linea,
        ),
      );
    } else if (actual.length >= LIMITES_PEDIDO.lineas) {
      mostrarAviso("Tu pedido ya tiene demasiados productos distintos.");
      cerrarVistaActual();
      return;
    } else {
      almacenDelCarrito.guardar([
        ...actual,
        {
          clave: idLocal(),
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad,
          nota: notaLimpia,
          adicionales,
        },
      ]);
    }

    mostrarAviso(`Agregaste ${cantidad} × ${producto.nombre}`);
    cerrarVistaActual();
  }

  function cambiarCantidad(clave: string, delta: number) {
    almacenDelCarrito.guardar(
      almacenDelCarrito.leer().map((linea) =>
        linea.clave === clave
          ? {
              ...linea,
              cantidad: Math.min(
                LIMITES_PEDIDO.cantidad,
                Math.max(1, linea.cantidad + delta),
              ),
            }
          : linea,
      ),
    );
  }

  function quitarDelCarrito(clave: string) {
    almacenDelCarrito.guardar(
      almacenDelCarrito.leer().filter((linea) => linea.clave !== clave),
    );
  }

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
    almacenDelCarrito.guardar([]);
    // La confirmación pasa a ser la pantalla de "pedido enviado": misma
    // entrada del historial y misma profundidad, así "Volver a la carta"
    // sabe cuánto retroceder.
    const params = paramsSinVistas();
    params.set(PARAM_ENVIADO, String(resultado.numero));
    window.history.replaceState(
      { [CLAVE_PROFUNDIDAD]: profundidadActual() },
      "",
      urlDe(params),
    );
    // Y ahí termina lo que hace el código: el mensaje al local lo manda el
    // cliente tocando el botón de esa pantalla, que es un enlace de
    // verdad (ver pantalla-enviado.tsx). No se abre WhatsApp por código:
    // es lo que hacía que iOS preguntara antes de abrirlo.
  }

  // --- Barra de categorías --------------------------------------------

  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(
    categorias[0]?.id ?? null,
  );
  const refBarraCategorias = useRef<HTMLDivElement>(null);

  // La categoría que está pasando por arriba de la pantalla se marca en la
  // barra, para que el cliente sepa dónde está.
  useEffect(() => {
    const visibles = new Set<string>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const id = entrada.target.getAttribute("data-categoria");
          if (!id) continue;
          if (entrada.isIntersecting) visibles.add(id);
          else visibles.delete(id);
        }
        const primera = categorias.find((categoria) => visibles.has(categoria.id));
        if (primera) setCategoriaActiva(primera.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const categoria of categorias) {
      const seccion = document.getElementById(idSeccion(categoria.id));
      if (seccion) observador.observe(seccion);
    }
    return () => observador.disconnect();
  }, [categorias]);

  // Que la pastilla activa no quede escondida fuera de la barra.
  useEffect(() => {
    const barra = refBarraCategorias.current;
    if (!barra || !categoriaActiva) return;
    const pastilla = barra.querySelector(`[data-pastilla="${categoriaActiva}"]`);
    if (!(pastilla instanceof HTMLElement)) return;
    barra.scrollTo({
      left: pastilla.offsetLeft - barra.clientWidth / 2 + pastilla.clientWidth / 2,
      behavior: comportamientoScroll(),
    });
  }, [categoriaActiva]);

  function irACategoria(categoriaId: string) {
    setCategoriaActiva(categoriaId);
    document
      .getElementById(idSeccion(categoriaId))
      ?.scrollIntoView({ behavior: comportamientoScroll(), block: "start" });
  }

  return (
    <div className="min-h-dvh flex-1 bg-neutral-50 font-sans text-neutral-900 scheme-light">
      <header className="bg-white">
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-6">
          <h1 className="text-3xl leading-tight font-black tracking-tight text-balance">
            {comercio.nombre}
          </h1>
          <p className="mt-2 text-base text-pretty text-neutral-600">
            {tomandoPedidos
              ? "Elegí lo que quieras y hacé tu pedido para retirar o con envío."
              : "Mirá la carta y los precios."}
          </p>

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
        </div>
      </header>

      {categorias.length > 1 && (
        <nav
          aria-label="Categorías de la carta"
          className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur"
        >
          <div
            ref={refBarraCategorias}
            className="relative mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {categorias.map((categoria) => {
              const activa = categoria.id === categoriaActiva;
              return (
                <button
                  key={categoria.id}
                  type="button"
                  data-pastilla={categoria.id}
                  onClick={() => irACategoria(categoria.id)}
                  aria-current={activa ? "true" : undefined}
                  className={`shrink-0 rounded-full px-4 py-2.5 text-base font-semibold whitespace-nowrap transition-colors ${
                    activa
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700 active:bg-neutral-200"
                  }`}
                >
                  {categoria.nombre}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-40">
        {categoriasVistas.map((categoria) => (
          <section
            key={categoria.id}
            id={idSeccion(categoria.id)}
            data-categoria={categoria.id}
            aria-labelledby={`titulo-${idSeccion(categoria.id)}`}
            className="scroll-mt-20 pb-8"
          >
            <h2
              id={`titulo-${idSeccion(categoria.id)}`}
              className="mb-3 text-xl font-bold tracking-tight"
            >
              {categoria.nombre}
            </h2>
            <ul className="space-y-3">
              {categoria.productos.map((producto) => (
                <li key={producto.id}>
                  <TarjetaProducto
                    producto={producto}
                    enElPedido={unidadesPorProducto.get(producto.id) ?? 0}
                    soloVer={!tomandoPedidos}
                    onElegir={() => abrirVista(PARAM_PRODUCTO, producto.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="space-y-4 pt-2 text-center text-sm text-neutral-500">
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
        </footer>
      </main>

      {tomandoPedidos ? (
        <BarraPedido
          unidades={unidades}
          total={total}
          hayNoDisponibles={lineasNoDisponibles > 0}
          onAbrir={() => abrirVista(PARAM_VER, "pedido")}
        />
      ) : (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="mx-auto max-w-2xl rounded-2xl bg-neutral-800 px-5 py-3.5 text-center text-base font-semibold text-white shadow-lg">
            Ahora no se están tomando pedidos
          </p>
        </div>
      )}

      {/* Lo lee un lector de pantalla; el cartel de abajo es para la vista. */}
      <p aria-live="polite" className="sr-only">
        {textoAviso}
      </p>
      {textoAviso && !hojaAbierta && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <p className="flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white shadow-lg">
            <IconoListo className="h-5 w-5 shrink-0" />
            {textoAviso}
          </p>
        </div>
      )}

      {productoAbierto && (
        <HojaProducto
          key={productoAbierto.id}
          producto={productoAbierto}
          onAgregar={(cantidad, nota, adicionales) =>
            agregarAlCarrito(productoAbierto, cantidad, nota, adicionales)
          }
          onCerrar={cerrarVistaActual}
        />
      )}

      {pedidoAbierto && (
        <HojaPedido
          slug={slug}
          lineas={lineas}
          total={total}
          lineasNoDisponibles={lineasNoDisponibles}
          datosIniciales={datosGuardados}
          confirmando={confirmando}
          onAbrirConfirmacion={() => abrirVista(PARAM_VER, "confirmar")}
          onCerrarConfirmacion={cerrarVistaActual}
          onProductosNoDisponibles={marcarNoDisponibles}
          onCambiarCantidad={cambiarCantidad}
          onQuitar={quitarDelCarrito}
          onEnviado={alEnviarPedido}
          onCerrar={cerrarVistaActual}
        />
      )}

      <VigilarEstadoLocal
        slug={slug}
        tomandoPedidos={tomandoPedidos}
        leidaEn={leidaEn}
        pausado={hojaAbierta}
        onSinStock={alSaberStock}
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
    </div>
  );
}

// ---------------------------------------------------------------------
// Carta
// ---------------------------------------------------------------------

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

function TarjetaProducto({
  producto,
  enElPedido,
  soloVer,
  onElegir,
}: {
  producto: ProductoLanding;
  enElPedido: number;
  // El local no está tomando pedidos: se muestra, pero no se toca.
  soloVer: boolean;
  onElegir: () => void;
}) {
  if (producto.sinStock) {
    // En gris y con la leyenda, no oculto: si el cliente lo viene a buscar,
    // tiene que entender por qué no lo puede pedir.
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-500">
            {producto.nombre}
          </p>
          {producto.descripcion && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-neutral-400">
              {producto.descripcion}
            </p>
          )}
          <p className="mt-2 inline-flex rounded-full bg-neutral-200 px-2.5 py-1 text-sm font-semibold text-neutral-600">
            Sin stock por ahora
          </p>
        </div>
        <p className="shrink-0 text-base font-semibold text-neutral-400 tabular-nums">
          {formatearPrecio(producto.precio)}
        </p>
      </div>
    );
  }

  if (soloVer) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-900">
            {producto.nombre}
          </p>
          {producto.descripcion && (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-neutral-500">
              {producto.descripcion}
            </p>
          )}
        </div>
        <p className="shrink-0 text-base font-bold text-neutral-900 tabular-nums">
          {formatearPrecio(producto.precio)}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onElegir}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] active:bg-neutral-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-neutral-900">
          {producto.nombre}
        </span>
        {producto.descripcion && (
          <span className="mt-1 line-clamp-2 block text-sm leading-snug text-neutral-500">
            {producto.descripcion}
          </span>
        )}
        <span className="mt-2 block text-base font-bold text-neutral-900 tabular-nums">
          {formatearPrecio(producto.precio)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white"
        >
          <IconoMas className="h-5 w-5" />
        </span>
        {enElPedido > 0 && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-emerald-800 ring-1 ring-emerald-600/20">
            {enElPedido} en tu pedido
          </span>
        )}
      </span>
    </button>
  );
}

function BarraPedido({
  unidades,
  total,
  hayNoDisponibles,
  onAbrir,
}: {
  unidades: number;
  total: number;
  hayNoDisponibles: boolean;
  onAbrir: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto max-w-2xl">
        {unidades === 0 ? (
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-3.5 shadow-lg ring-1 ring-neutral-200">
            <span className="min-w-0">
              <span className="block font-semibold text-neutral-900">
                Tu pedido
              </span>
              <span className="block text-sm text-neutral-500">
                Tocá un producto para agregarlo
              </span>
            </span>
            <span className="shrink-0 text-lg font-bold text-neutral-400 tabular-nums">
              {formatearPrecio(0)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAbrir}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-xl transition ${
              hayNoDisponibles
                ? "bg-red-700 active:bg-red-800"
                : "bg-neutral-900 active:bg-neutral-700"
            }`}
          >
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-white/15 px-2 text-base font-bold tabular-nums">
              {unidades}
            </span>
            <span className="flex-1 text-left text-lg font-semibold">
              {hayNoDisponibles ? "Revisá tu pedido" : "Ver mi pedido"}
            </span>
            <span className="text-lg font-bold tabular-nums">
              {formatearPrecio(total)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------

/**
 * Pantalla completa en el celular (nada chiquito que apuntar), ventana
 * centrada en la compu. Arriba un "← Volver" con texto (más claro que una
 * cruz para cualquiera), y el botón principal fijo abajo, siempre a mano.
 */
function Hoja({
  etiqueta,
  textoVolver,
  onCerrar,
  pie,
  children,
}: {
  etiqueta: string;
  textoVolver: string;
  onCerrar: () => void;
  pie: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans text-neutral-900 scheme-light sm:bg-neutral-950/40 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[min(90dvh,52rem)] sm:max-w-lg sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-2 py-2">
          <button
            type="button"
            // Al abrir la hoja, el foco entra en ella (teclado y lector de
            // pantalla); en el celular no abre el teclado: es un botón.
            autoFocus
            onClick={onCerrar}
            className="rounded-full px-3 py-2.5 text-base font-semibold text-neutral-700 active:bg-neutral-100"
          >
            ← {textoVolver}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 sm:flex"
          >
            <IconoCerrar className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-8">
          {children}
        </div>
        <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {pie}
        </div>
      </div>
    </div>
  );
}

function Contador({
  valor,
  etiqueta,
  onRestar,
  onSumar,
}: {
  valor: number;
  etiqueta: string;
  onRestar: () => void;
  onSumar: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="flex items-center gap-1 rounded-full bg-neutral-100 p-1"
    >
      <button
        type="button"
        onClick={onRestar}
        disabled={valor <= 1}
        aria-label="Uno menos"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-sm active:bg-neutral-200 disabled:opacity-40 disabled:shadow-none"
      >
        <IconoMenos className="h-5 w-5" />
      </button>
      <span className="w-9 text-center text-lg font-bold tabular-nums">
        {valor}
      </span>
      <button
        type="button"
        onClick={onSumar}
        disabled={valor >= LIMITES_PEDIDO.cantidad}
        aria-label="Uno más"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-sm active:bg-neutral-200 disabled:opacity-40 disabled:shadow-none"
      >
        <IconoMas className="h-5 w-5" />
      </button>
    </div>
  );
}

function HojaProducto({
  producto,
  onAgregar,
  onCerrar,
}: {
  producto: ProductoLanding;
  onAgregar: (cantidad: number, nota: string, adicionales: string[]) => void;
  onCerrar: () => void;
}) {
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  // Abierta de entrada solo si el ítem ya trae una aclaración (al reabrirlo
  // desde el pedido): si no, escondería algo que ya está escrito.
  const [notaAbierta, setNotaAbierta] = useState(() => nota.length > 0);
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const adicionalesElegidos = producto.adicionales.filter((adicional) =>
    elegidos.has(adicional.id),
  );
  const subtotal = subtotalLinea(
    producto.precio,
    adicionalesElegidos.map((adicional) => adicional.precioExtra),
    cantidad,
  );

  function alternar(id: string) {
    setElegidos((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  return (
    <Hoja
      etiqueta={producto.nombre}
      textoVolver="Volver a la carta"
      onCerrar={onCerrar}
      pie={
        <button
          type="button"
          onClick={() =>
            onAgregar(
              cantidad,
              nota,
              adicionalesElegidos.map((adicional) => adicional.id),
            )
          }
          disabled={producto.sinStock}
          className="flex w-full items-center justify-between gap-4 rounded-2xl bg-neutral-900 px-6 py-4 text-lg font-bold text-white active:bg-neutral-700 disabled:bg-neutral-300 disabled:text-neutral-600"
        >
          <span>
            {producto.sinStock
              ? "Sin stock por ahora"
              : cantidad > 1
                ? `Agregar ${cantidad} al pedido`
                : "Agregar al pedido"}
          </span>
          {!producto.sinStock && (
            <span className="tabular-nums">{formatearPrecio(subtotal)}</span>
          )}
        </button>
      }
    >
      <p className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
        {producto.categoriaNombre}
      </p>
      <h2 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-balance">
        {producto.nombre}
      </h2>
      {producto.descripcion && (
        <p className="mt-2 text-base leading-relaxed text-pretty text-neutral-600">
          {producto.descripcion}
        </p>
      )}
      <p className="mt-3 text-xl font-bold tabular-nums">
        {formatearPrecio(producto.precio)}
      </p>

      {producto.sinStock ? (
        <p className="mt-6 rounded-2xl bg-neutral-100 p-4 text-base font-semibold text-neutral-600">
          Este producto no tiene stock por ahora, así que no se puede pedir.
        </p>
      ) : (
        <>
          {producto.adicionales.length > 0 && (
            <fieldset className="mt-8">
              <legend className="text-lg font-bold">¿Le agregás algo?</legend>
              <p className="text-sm text-neutral-500">
                Opcional. Podés elegir varios.
              </p>
              <div className="mt-3 space-y-2">
                {producto.adicionales.map((adicional) => (
                  <label
                    key={adicional.id}
                    className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-neutral-200 px-4 py-3.5 has-checked:border-neutral-900 has-checked:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={elegidos.has(adicional.id)}
                      onChange={() => alternar(adicional.id)}
                      className="h-6 w-6 shrink-0 accent-neutral-900"
                    />
                    <span className="min-w-0 flex-1 text-base font-medium">
                      {adicional.nombre}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-neutral-600 tabular-nums">
                      {adicional.precioExtra > 0
                        ? `+ ${formatearPrecio(adicional.precioExtra)}`
                        : "Sin cargo"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Escondida detrás de un botón: la mayoría de los productos no
              la necesita (una gaseosa no lleva aclaración) y un campo abierto
              invita a escribir cualquier cosa, que después alguien tiene que
              leer en la cocina. Sigue siendo opcional y se guarda igual. Una
              vez abierta no se vuelve a cerrar: si se cerrara con algo
              escrito, se mandaría una aclaración que el cliente ya no ve. */}
          {notaAbierta ? (
            <div className="mt-8">
              <label htmlFor="nota-producto" className="text-lg font-bold">
                ¿Alguna aclaración?
              </label>
              <p className="text-sm text-neutral-500">Opcional.</p>
              <textarea
                id="nota-producto"
                rows={2}
                // Recién montado, así que el foco y el teclado salen solos:
                // lo acaban de tocar para escribir.
                autoFocus
                maxLength={LIMITES_PEDIDO.notaItem}
                value={nota}
                onChange={(evento) => setNota(evento.target.value)}
                placeholder='Ej: "sin sal", "bien cocida"'
                className="mt-3 w-full resize-none rounded-2xl border-2 border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNotaAbierta(true)}
              className="mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 py-3.5 text-base font-semibold text-neutral-600 active:bg-neutral-50"
            >
              <IconoMas className="h-5 w-5" />
              Agregar aclaración
            </button>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            <p className="text-lg font-bold">Cantidad</p>
            <Contador
              valor={cantidad}
              etiqueta={`Cantidad de ${producto.nombre}`}
              onRestar={() => setCantidad((actual) => Math.max(1, actual - 1))}
              onSumar={() =>
                setCantidad((actual) =>
                  Math.min(LIMITES_PEDIDO.cantidad, actual + 1),
                )
              }
            />
          </div>
        </>
      )}
    </Hoja>
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

              <ul className="mt-5 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 px-4">
                {lineas.map((linea) => (
                  <li
                    key={linea.clave}
                    className="flex items-start justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-semibold">
                        {linea.cantidad} × {linea.nombre}
                      </p>
                      {linea.categoriaNombre && (
                        <p className="text-sm text-neutral-500">
                          {linea.categoriaNombre}
                        </p>
                      )}
                      {linea.adicionales.length > 0 && (
                        <p className="mt-0.5 text-sm text-neutral-600">
                          Con:{" "}
                          {linea.adicionales
                            .map((adicional) => adicional.nombre)
                            .join(", ")}
                        </p>
                      )}
                      {linea.nota && (
                        <p className="mt-0.5 text-sm text-neutral-600 italic">
                          “{linea.nota}”
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums">
                      {formatearPrecio(linea.subtotal ?? 0)}
                    </p>
                  </li>
                ))}
              </ul>

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

function LineaDelPedido({
  linea,
  onCambiarCantidad,
  onQuitar,
}: {
  linea: LineaVista;
  onCambiarCantidad: (delta: number) => void;
  onQuitar: () => void;
}) {
  const disponible = linea.subtotal !== null;
  return (
    <li className={`p-4 ${disponible ? "bg-white" : "bg-red-50"}`}>
      {!disponible && (
        <p className="mb-2 text-base font-bold text-red-700">
          {linea.motivo}: sacalo para poder enviar el pedido.
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-base font-semibold ${
              disponible ? "text-neutral-900" : "text-red-800 line-through"
            }`}
          >
            {linea.nombre}
          </p>
          {linea.categoriaNombre && (
            <p className="text-sm text-neutral-500">{linea.categoriaNombre}</p>
          )}
          {linea.adicionales.length > 0 && (
            <p className="mt-0.5 text-sm text-neutral-600">
              Con: {linea.adicionales.map((adicional) => adicional.nombre).join(", ")}
            </p>
          )}
          {linea.nota && (
            <p className="mt-0.5 text-sm text-neutral-600 italic">
              “{linea.nota}”
            </p>
          )}
        </div>
        {linea.subtotal !== null && (
          <p className="shrink-0 text-base font-semibold tabular-nums">
            {formatearPrecio(linea.subtotal)}
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {disponible ? (
          <Contador
            valor={linea.cantidad}
            etiqueta={`Cantidad de ${linea.nombre}`}
            onRestar={() => onCambiarCantidad(-1)}
            onSumar={() => onCambiarCantidad(1)}
          />
        ) : (
          <span className="text-sm text-red-800">
            {linea.cantidad} {linea.cantidad === 1 ? "unidad" : "unidades"}
          </span>
        )}
        <button
          type="button"
          onClick={onQuitar}
          className={
            disponible
              ? "rounded-full px-3 py-2.5 text-base font-semibold text-neutral-500 active:bg-neutral-100"
              : "rounded-xl bg-red-700 px-5 py-3 text-base font-bold text-white active:bg-red-800"
          }
        >
          Quitar
        </button>
      </div>
    </li>
  );
}
