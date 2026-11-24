"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { idLocal } from "@/lib/id-local";
import { subtotalLinea, sumarMontos } from "@/lib/landing/precios";
import { LIMITES_PEDIDO } from "@/lib/landing/validacion";

import { almacenCarrito, useAlmacen } from "../almacen-local";
import type { CategoriaCarta, LineaVista, ProductoCarta } from "./tipos";

/**
 * El carrito del cliente y todo lo que se deriva de él, compartido por la
 * landing de take away (`/{slug}`) y el pedido por QR de mesa
 * (`/{slug}/mesa`).
 *
 * Tres cosas que vale entender antes de tocarlo:
 *
 * 1. **El carrito guarda ids y cantidades, nunca precios.** Lo guardado en
 *    el celular (ver ../almacen-local.ts) se cruza contra la carta de esta
 *    página para armar `lineas`: nombre, precio y adicionales salen siempre
 *    de la carta, no de lo guardado.
 * 2. **Lo que ya no se puede pedir no se saca solo.** Queda en la lista con
 *    `subtotal: null` y un `motivo`, y el cliente lo tiene que sacar a
 *    mano: que un producto desaparezca del pedido sin aviso es peor que
 *    tener que tocar "Quitar".
 * 3. **Hay dos fuentes de "esto ya no está"**, además del `sinStock` que
 *    trajo la carta: lo que avisó el servidor al intentar mandar el pedido
 *    (`marcarNoDisponibles`) y lo que llega del estado del local que la
 *    pantalla consulta cada tanto (`alSaberStock`, ver
 *    ../vigilar-estado-local.tsx). Las dos valen solo para la carta con la
 *    que se marcaron: si la página trae una carta nueva, ya viene al día.
 */

function mismosIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export type Carrito = {
  /** La carta con el "sin stock" al día de las tres fuentes. */
  categoriasVistas: CategoriaCarta[];
  productosPorId: ReadonlyMap<string, ProductoCarta>;
  lineas: LineaVista[];
  total: number;
  unidades: number;
  lineasNoDisponibles: number;
  /** Cuántas unidades de cada producto hay en el pedido (para la tarjeta). */
  unidadesPorProducto: ReadonlyMap<string, number>;
  agregar: (
    producto: ProductoCarta,
    cantidad: number,
    nota: string,
    adicionales: string[],
  ) => void;
  cambiarCantidad: (clave: string, delta: number) => void;
  quitar: (clave: string) => void;
  vaciar: () => void;
  /**
   * Reemplaza el carrito por estas líneas, dejando afuera lo que ya no
   * está en la carta. Es para devolverle el pedido al cliente cuando su
   * código de mesa venció: sin esto tendría que armarlo todo de nuevo a
   * mano. Devuelve cuántas líneas no se pudieron reponer.
   */
  reponer: (
    lineas: {
      productoId: string;
      cantidad: number;
      nota: string;
      adicionalesIds: string[];
    }[],
  ) => number;
  marcarNoDisponibles: (ids: string[]) => void;
  alSaberStock: (sinStock: ReadonlySet<string>) => void;
  /** El cartelito de abajo: "Agregaste 2 × Muzzarella". */
  textoAviso: string | null;
  mostrarAviso: (texto: string) => void;
};

export function useCarrito({
  slug,
  categorias,
  tomandoPedidos,
}: {
  slug: string;
  categorias: CategoriaCarta[];
  tomandoPedidos: boolean;
}): Carrito {
  const almacenDelCarrito = useMemo(() => almacenCarrito(slug), [slug]);
  const carrito = useAlmacen(almacenDelCarrito);

  // Lo que el servidor dijo que ya no se puede pedir al intentar mandar el
  // pedido, aunque la carta de esta página todavía no lo sepa.
  const [apagados, setApagados] = useState<{
    carta: CategoriaCarta[];
    ids: ReadonlySet<string>;
  } | null>(null);
  const idsApagados =
    apagados && apagados.carta === categorias ? apagados.ids : null;

  // Lo que está sin stock según el estado del local que la pantalla va
  // consultando: lo que la cocina o el mostrador marcan mientras el cliente
  // mira.
  const [stockAlDia, setStockAlDia] = useState<{
    carta: CategoriaCarta[];
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

  function marcarNoDisponibles(ids: string[]) {
    setApagados({
      carta: categorias,
      ids: new Set([...(idsApagados ?? []), ...ids]),
    });
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

  // --- El cartelito de abajo ------------------------------------------

  const [aviso, setAviso] = useState<string | null>(null);
  const refTimerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarAviso(texto: string) {
    if (refTimerAviso.current) clearTimeout(refTimerAviso.current);
    setAviso(texto);
    refTimerAviso.current = setTimeout(() => setAviso(null), 2600);
  }

  // Si el local abre mientras el cliente mira la carta, la página se
  // habilita sola (VigilarEstadoLocal): se le avisa, para que entienda por
  // qué cambió.
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

  // --- Tocar el carrito -----------------------------------------------

  function agregar(
    producto: ProductoCarta,
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

  function quitar(clave: string) {
    almacenDelCarrito.guardar(
      almacenDelCarrito.leer().filter((linea) => linea.clave !== clave),
    );
  }

  function vaciar() {
    almacenDelCarrito.guardar([]);
  }

  function reponer(
    lineas: {
      productoId: string;
      cantidad: number;
      nota: string;
      adicionalesIds: string[];
    }[],
  ): number {
    // Lo que ya no está en la carta, o se quedó sin stock, no se repone: no
    // tiene sentido devolverle al carrito algo que no va a poder pedir.
    const reponibles = lineas.filter((linea) => {
      const producto = productosPorId.get(linea.productoId);
      return producto !== undefined && !producto.sinStock;
    });

    almacenDelCarrito.guardar(
      reponibles.slice(0, LIMITES_PEDIDO.lineas).map((linea) => ({
        clave: idLocal(),
        productoId: linea.productoId,
        nombre: productosPorId.get(linea.productoId)?.nombre ?? "",
        cantidad: Math.min(LIMITES_PEDIDO.cantidad, linea.cantidad),
        nota: linea.nota,
        adicionales: linea.adicionalesIds,
      })),
    );

    return lineas.length - reponibles.length;
  }

  return {
    categoriasVistas,
    productosPorId,
    lineas,
    total,
    unidades,
    lineasNoDisponibles,
    unidadesPorProducto,
    agregar,
    cambiarCantidad,
    quitar,
    vaciar,
    reponer,
    marcarNoDisponibles,
    alSaberStock,
    textoAviso: aviso ?? (recienAbrio ? "¡Ya estamos tomando pedidos!" : null),
    mostrarAviso,
  };
}
