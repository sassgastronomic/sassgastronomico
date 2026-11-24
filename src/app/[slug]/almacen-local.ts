import { useSyncExternalStore } from "react";

import { LIMITES_PEDIDO, esModalidad, esUuid } from "@/lib/landing/validacion";
import { esCodigoBorrador } from "@/lib/qr-mesa/codigo";
import type { ModalidadPedido } from "@/types/database";

/**
 * Lo que la landing recuerda en el celular del cliente (localStorage, por
 * comercio). Son comodidades, no datos que importen: si el navegador no
 * deja guardar (modo privado, almacenamiento bloqueado), todo sigue
 * andando en memoria mientras la página esté abierta.
 *
 * - El carrito: el cliente toca "atrás" sin querer, cambia a WhatsApp y el
 *   navegador le recarga la pestaña… y el pedido a medio armar sigue ahí.
 *   Se guardan ids y cantidades, nunca precios: al mostrarlo, los precios
 *   y lo que está disponible salen de la carta actual.
 * - Los últimos pedidos, con su link de seguimiento y el mensaje de
 *   WhatsApp: para ofrecer "Tu pedido #N" al volver a la landing (sin
 *   preguntarle nada al servidor), y para reabrir el chat del local con el
 *   pedido ya escrito (por ejemplo, si no llegó a mandarlo).
 * - Sus datos (nombre, modalidad, dirección): para no tener que
 *   escribirlos de nuevo la próxima vez. Se guardan solo después de un
 *   pedido enviado.
 *
 * Se lee con `useSyncExternalStore`: en el servidor (y durante la
 * hidratación) se usa el valor vacío, así el HTML del servidor y el del
 * navegador coinciden, y recién después aparece lo guardado.
 */

export type Almacen<T> = {
  leer: () => T;
  guardar: (valor: T) => void;
  suscribir: (aviso: () => void) => () => void;
  vacio: T;
};

const almacenes = new Map<string, unknown>();

function almacenLocal<T>(
  clave: string,
  interpretar: (dato: unknown) => T,
  vacio: T,
): Almacen<T> {
  const existente = almacenes.get(clave);
  if (existente) return existente as Almacen<T>;

  let cargado = false;
  let valor = vacio;
  const avisos = new Set<() => void>();

  function cargar(): T {
    try {
      const crudo = window.localStorage.getItem(clave);
      return crudo === null ? vacio : interpretar(JSON.parse(crudo));
    } catch {
      return vacio;
    }
  }

  const almacen: Almacen<T> = {
    vacio,
    leer() {
      if (!cargado) {
        valor = cargar();
        cargado = true;
      }
      return valor;
    },
    guardar(nuevo) {
      valor = nuevo;
      cargado = true;
      try {
        window.localStorage.setItem(clave, JSON.stringify(nuevo));
      } catch {
        // Sin almacenamiento: queda solo en memoria.
      }
      avisos.forEach((aviso) => aviso());
    },
    suscribir(aviso) {
      avisos.add(aviso);
      // Otra pestaña del mismo local (ej. abrió el link dos veces).
      function alCambiarEnOtraPestana(evento: StorageEvent) {
        if (evento.key !== clave) return;
        valor = cargar();
        aviso();
      }
      window.addEventListener("storage", alCambiarEnOtraPestana);
      return () => {
        avisos.delete(aviso);
        window.removeEventListener("storage", alCambiarEnOtraPestana);
      };
    },
  };
  almacenes.set(clave, almacen);
  return almacen;
}

export function useAlmacen<T>(almacen: Almacen<T>): T {
  return useSyncExternalStore(
    almacen.suscribir,
    almacen.leer,
    () => almacen.vacio,
  );
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function textoCorto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.slice(0, maximo) : "";
}

// ---------------------------------------------------------------------
// Carrito
// ---------------------------------------------------------------------

export type LineaCarrito = {
  clave: string;
  productoId: string;
  // Solo para mostrar algo si el producto desaparece de la carta; el
  // nombre que vale es el de la carta actual.
  nombre: string;
  cantidad: number;
  nota: string;
  adicionales: string[];
};

const CARRITO_VACIO: LineaCarrito[] = [];

function interpretarCarrito(dato: unknown): LineaCarrito[] {
  if (!Array.isArray(dato)) return CARRITO_VACIO;
  const crudas: unknown[] = dato;
  const lineas: LineaCarrito[] = [];
  for (const linea of crudas.slice(0, LIMITES_PEDIDO.lineas)) {
    if (!esObjeto(linea) || !esUuid(linea.productoId)) continue;
    const cantidad = linea.cantidad;
    if (
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > LIMITES_PEDIDO.cantidad
    ) {
      continue;
    }
    lineas.push({
      clave: textoCorto(linea.clave, 60) || linea.productoId,
      productoId: linea.productoId,
      nombre: textoCorto(linea.nombre, 120),
      cantidad,
      nota: textoCorto(linea.nota, LIMITES_PEDIDO.notaItem),
      adicionales: Array.isArray(linea.adicionales)
        ? linea.adicionales.filter(esUuid)
        : [],
    });
  }
  return lineas;
}

export function almacenCarrito(slug: string): Almacen<LineaCarrito[]> {
  return almacenLocal(
    `pedido-online:${slug}:carrito`,
    interpretarCarrito,
    CARRITO_VACIO,
  );
}

// ---------------------------------------------------------------------
// Últimos pedidos
// ---------------------------------------------------------------------

export type PedidoReciente = {
  numero: number;
  // Código y link de seguimiento: se le muestran al cliente apenas
  // confirma (pantalla-enviado.tsx).
  codigo: string;
  link: string;
  mensaje: string;
  creadoEn: number;
};

const PEDIDOS_VACIO: PedidoReciente[] = [];
// Red de seguridad del aviso "Tu pedido #N": lo normal es que se borre
// cuando el cliente ve en el seguimiento que el pedido se cerró; si nunca
// entra, a estas horas de hecho se borra solo. Es un plazo de la landing,
// aparte del vencimiento del link (plazos_seguimiento, en la base).
export const VIGENCIA_PEDIDO_RECIENTE_MS = 3 * 60 * 60 * 1000;
// Un pedido de 50 líneas con adicionales y notas entra holgado.
const LARGO_MAXIMO_MENSAJE = 8000;
const MAXIMO_PEDIDOS_RECIENTES = 5;

function interpretarPedidos(dato: unknown): PedidoReciente[] {
  if (!Array.isArray(dato)) return PEDIDOS_VACIO;
  const crudos: unknown[] = dato;
  const ahora = Date.now();
  return crudos
    .filter(
      (pedido): pedido is PedidoReciente =>
        esObjeto(pedido) &&
        typeof pedido.numero === "number" &&
        Number.isInteger(pedido.numero) &&
        pedido.numero > 0 &&
        esUuid(pedido.codigo) &&
        typeof pedido.link === "string" &&
        /^https?:\/\//.test(pedido.link) &&
        typeof pedido.mensaje === "string" &&
        pedido.mensaje.length <= LARGO_MAXIMO_MENSAJE &&
        typeof pedido.creadoEn === "number" &&
        pedido.creadoEn > ahora - VIGENCIA_PEDIDO_RECIENTE_MS,
    )
    .slice(0, MAXIMO_PEDIDOS_RECIENTES);
}

export function almacenPedidosRecientes(
  slug: string,
): Almacen<PedidoReciente[]> {
  return almacenLocal(
    `pedido-online:${slug}:pedidos`,
    interpretarPedidos,
    PEDIDOS_VACIO,
  );
}

export function recordarPedido(slug: string, pedido: PedidoReciente) {
  const almacen = almacenPedidosRecientes(slug);
  const otros = almacen
    .leer()
    .filter((otro) => otro.numero !== pedido.numero);
  almacen.guardar([pedido, ...otros].slice(0, MAXIMO_PEDIDOS_RECIENTES));
}

// Saca un pedido de lo guardado: el cliente vio en el seguimiento que ya
// se cerró (o que el link ya no existe), o se cumplió la vigencia.
// Guardar reescribe también lo que estaba vencido, así no queda nada viejo
// en el celular.
export function olvidarPedido(slug: string, codigo: string) {
  const almacen = almacenPedidosRecientes(slug);
  const buscado = codigo.toLowerCase();
  almacen.guardar(
    almacen.leer().filter((pedido) => pedido.codigo.toLowerCase() !== buscado),
  );
}

// Lo que se lee ya viene sin los vencidos (interpretarPedidos), pero en el
// almacenamiento del navegador siguen escritos hasta la próxima vez que se
// guarde algo: esto los borra de verdad.
export function limpiarPedidosVencidos(slug: string) {
  const almacen = almacenPedidosRecientes(slug);
  almacen.guardar(almacen.leer());
}

// ---------------------------------------------------------------------
// Borrador del QR de mesa
// ---------------------------------------------------------------------

/**
 * El código del QR que el cliente le tiene que mostrar al mozo, con una
 * foto de lo que pidió. Se guarda para que pueda volver a abrirlo si cierra
 * la pestaña, mientras siga vigente.
 *
 * Por qué una foto de las líneas y no el carrito de ese momento: el QR
 * apunta a un borrador que ya quedó fijo en la base. Si el cliente después
 * agrega algo al carrito, la pantalla del QR tiene que seguir mostrando lo
 * que el QR contiene de verdad, no lo que el carrito tenga ahora. Es el
 * mismo criterio que `PedidoReciente.mensaje`: un pedido ya mandado es una
 * foto, no una intención que se vuelve a valuar.
 */
export type LineaBorrador = {
  // Para mostrar la foto.
  nombre: string;
  categoriaNombre: string | null;
  cantidad: number;
  nota: string;
  // Nombres, ya resueltos: es lo que se muestra.
  adicionales: string[];
  subtotal: number;
  // Y los ids, para poder devolverle el pedido al carrito si el código
  // vence (ver `reponer` en ./carta/usar-carrito.ts): sin esto, "armar el
  // pedido de nuevo" lo obligaría a tipear todo otra vez.
  productoId: string;
  adicionalesIds: string[];
};

export type BorradorQr = {
  codigo: string;
  /** El link que va adentro del QR (absoluto: lo escanea otro celular). */
  link: string;
  /** Cuándo vence, en milisegundos (`Date.now()`). */
  venceEn: number;
  lineas: LineaBorrador[];
  total: number;
};

/**
 * Un código vencido **no** se descarta al leerlo: la pantalla del QR lo
 * necesita para poder decir "tu código venció" y devolverle el pedido al
 * carrito (el carrito quedó vacío al confirmar, así que si lo tiráramos
 * acá el cliente perdería su pedido al recargar). Se descarta recién
 * pasada esta gracia, que es la red de seguridad para que no quede nada
 * viejo en el celular — mismo criterio que VIGENCIA_PEDIDO_RECIENTE_MS.
 */
const GRACIA_BORRADOR_MS = 3 * 60 * 60 * 1000;

function interpretarLineasBorrador(dato: unknown): LineaBorrador[] {
  if (!Array.isArray(dato)) return [];
  const crudas: unknown[] = dato;
  const lineas: LineaBorrador[] = [];
  for (const linea of crudas.slice(0, LIMITES_PEDIDO.lineas)) {
    if (!esObjeto(linea) || !esUuid(linea.productoId)) continue;
    const cantidad = linea.cantidad;
    const subtotal = linea.subtotal;
    if (
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > LIMITES_PEDIDO.cantidad ||
      typeof subtotal !== "number" ||
      !Number.isFinite(subtotal)
    ) {
      continue;
    }
    const adicionales: unknown = linea.adicionales;
    const adicionalesIds: unknown = linea.adicionalesIds;
    lineas.push({
      nombre: textoCorto(linea.nombre, 120),
      categoriaNombre: textoCorto(linea.categoriaNombre, 120) || null,
      cantidad,
      nota: textoCorto(linea.nota, LIMITES_PEDIDO.notaItem),
      adicionales: Array.isArray(adicionales)
        ? adicionales
            .map((nombre: unknown) => textoCorto(nombre, 120))
            .filter((nombre) => nombre.length > 0)
        : [],
      subtotal,
      productoId: linea.productoId,
      adicionalesIds: Array.isArray(adicionalesIds)
        ? adicionalesIds.filter(esUuid)
        : [],
    });
  }
  return lineas;
}

function interpretarBorrador(dato: unknown): BorradorQr | null {
  if (!esObjeto(dato)) return null;
  const { codigo, link, venceEn, total } = dato;
  if (
    !esCodigoBorrador(codigo) ||
    typeof link !== "string" ||
    !/^https?:\/\//.test(link) ||
    typeof venceEn !== "number" ||
    !Number.isFinite(venceEn) ||
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    venceEn <= Date.now() - GRACIA_BORRADOR_MS
  ) {
    return null;
  }
  const lineas = interpretarLineasBorrador(dato.lineas);
  if (lineas.length === 0) return null;
  return { codigo, link, venceEn, lineas, total };
}

export function almacenBorradorQr(slug: string): Almacen<BorradorQr | null> {
  return almacenLocal(
    `pedido-online:${slug}:borrador-qr`,
    interpretarBorrador,
    null,
  );
}

// ---------------------------------------------------------------------
// Datos del cliente
// ---------------------------------------------------------------------

export type DatosCliente = {
  nombre: string;
  modalidad: ModalidadPedido | null;
  direccion: string;
};

const DATOS_VACIOS: DatosCliente = {
  nombre: "",
  modalidad: null,
  direccion: "",
};

function interpretarDatos(dato: unknown): DatosCliente {
  if (!esObjeto(dato)) return DATOS_VACIOS;
  return {
    nombre: textoCorto(dato.nombre, LIMITES_PEDIDO.nombre),
    modalidad: esModalidad(dato.modalidad) ? dato.modalidad : null,
    direccion: textoCorto(dato.direccion, LIMITES_PEDIDO.direccion),
  };
}

export function almacenDatosCliente(slug: string): Almacen<DatosCliente> {
  return almacenLocal(
    `pedido-online:${slug}:datos`,
    interpretarDatos,
    DATOS_VACIOS,
  );
}
