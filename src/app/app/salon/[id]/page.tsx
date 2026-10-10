import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { armarResumen } from "@/lib/salon/resumen";
import { formatearTiempoAbierta } from "@/lib/salon/tiempo";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoItem } from "@/types/database";

import { ActualizarEnVivo } from "../actualizar-en-vivo";

import { marcarEntregado, marcarTodoEntregado } from "./actions";
import { BotonEnvio } from "./boton-envio";
import { CerrarCuenta } from "./cerrar-cuenta";
import {
  CargaPedido,
  type CategoriaPicker,
  type ProductoPicker,
} from "./carga-pedido";

// Azul para "listo" (lo que el mozo tiene que llevar), igual que en
// /app/salon — el verde ahí es "mesa libre". Siempre con texto, no solo
// color.
const ESTADO_ITEM: Record<EstadoItem, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-neutral-200 text-neutral-700" },
  en_preparacion: {
    texto: "En preparación",
    clase: "bg-amber-100 text-amber-900",
  },
  listo: { texto: "Listo", clase: "bg-blue-600 text-white" },
  entregado: { texto: "Entregado", clase: "bg-green-100 text-green-800" },
};

const formateadorPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
const formateadorHora = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

// Ventana de historial y tope de resultados para "Más pedidos" — números
// elegidos a criterio (no pedidos por la tarea): dos semanas alcanza para
// reflejar patrones sin quedar desactualizado, y por debajo de 3
// resultados la fila no aporta nada, mejor no mostrarla.
const DIAS_HISTORIAL_ACCESOS_RAPIDOS = 14;
const LIMITE_ACCESOS_RAPIDOS = 8;
const MINIMO_ACCESOS_RAPIDOS = 3;

type RondaItem = {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  precioUnitario: number;
  cantidad: number;
  nota: string | null;
  estado: EstadoItem;
  adicionales: { nombre: string; precioExtra: number }[];
};

type Ronda = {
  id: string;
  numero: number | null;
  creadoEn: string;
  // Solo lo de pedidos confirmados va a "Listo para llevar" (mismo filtro
  // que la pantalla de cocina).
  confirmado: boolean;
  // Lo cancelado no se cobra ni bloquea el cierre de la mesa.
  cancelado: boolean;
  items: RondaItem[];
};

/**
 * Carta disponible para pedir, vía `carta_publica` (RPC) — misma fuente
 * de verdad que /app/carta y la futura landing, nada de reimplementar acá
 * el filtro de sector→categoría→producto. Se le saca, además, lo que
 * tiene `sin_stock`: la carta pública lo deja atenuado para que el
 * cliente entienda por qué no está, pero acá no tiene sentido ofrecerlo
 * como opción tocable — el mozo no necesita "verlo aunque no se pueda".
 */
async function obtenerCategoriasParaPedir(
  slug: string,
): Promise<CategoriaPicker[]> {
  const supabase = await crearClienteServidor();
  const { data: carta } = await supabase.rpc("carta_publica", {
    p_slug: slug,
  });

  return (carta?.categorias ?? [])
    .map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      productos: categoria.productos
        .filter((producto) => !producto.sin_stock)
        .map((producto) => ({
          id: producto.id,
          nombre: producto.nombre,
          categoriaNombre: categoria.nombre,
          descripcion: producto.descripcion,
          precio: producto.precio,
          adicionales: producto.adicionales.map((adicional) => ({
            id: adicional.id,
            nombre: adicional.nombre,
            precioExtra: adicional.precio_extra,
          })),
        })),
    }))
    .filter((categoria) => categoria.productos.length > 0);
}

/**
 * Los productos más pedidos del comercio en los últimos
 * `DIAS_HISTORIAL_ACCESOS_RAPIDOS` días, calculados de `pedido_items` (no
 * de una tabla de resumen: no existe ninguna todavía). Se cruza contra lo
 * efectivamente disponible ahora mismo (`disponibles`, ya filtrado por
 * `obtenerCategoriasParaPedir`) — un producto que se pedía mucho pero hoy
 * está apagado no tiene sentido ofrecerlo como acceso rápido. Sin
 * historial suficiente, no se muestra la sección.
 */
async function obtenerAccesosRapidos(
  comercioId: string,
  disponibles: CategoriaPicker[],
): Promise<ProductoPicker[]> {
  const supabase = await crearClienteServidor();

  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_HISTORIAL_ACCESOS_RAPIDOS);

  const { data: pedidosRecientes } = await supabase
    .from("pedidos")
    .select("id")
    .eq("comercio_id", comercioId)
    .gte("creado_en", desde.toISOString());

  const pedidoIds = (pedidosRecientes ?? []).map((pedido) => pedido.id);
  if (pedidoIds.length === 0) return [];

  const { data: items } = await supabase
    .from("pedido_items")
    .select("producto_id, cantidad")
    .eq("comercio_id", comercioId)
    .in("pedido_id", pedidoIds);

  const cantidadPorProducto = new Map<string, number>();
  for (const item of items ?? []) {
    if (!item.producto_id) continue;
    cantidadPorProducto.set(
      item.producto_id,
      (cantidadPorProducto.get(item.producto_id) ?? 0) + item.cantidad,
    );
  }

  const disponiblesPorId = new Map(
    disponibles
      .flatMap((categoria) => categoria.productos)
      .map((producto) => [producto.id, producto] as const),
  );

  const ranking = [...cantidadPorProducto.entries()]
    .sort(([, cantidadA], [, cantidadB]) => cantidadB - cantidadA)
    .map(([productoId]) => disponiblesPorId.get(productoId))
    .filter((producto): producto is ProductoPicker => producto !== undefined)
    .slice(0, LIMITE_ACCESOS_RAPIDOS);

  return ranking.length >= MINIMO_ACCESOS_RAPIDOS ? ranking : [];
}

/**
 * Rondas ya cargadas sobre esta cuenta, con sus ítems y adicionales — tres
 * consultas de tamaño fijo (pedidos → pedido_items → pedido_item_adicionales),
 * nada de una por ronda. Más reciente primero: lo que más le importa
 * confirmar al mozo es "¿la que acabo de cargar entró bien?".
 */
async function obtenerRondas(
  comercioId: string,
  cuentaId: string,
): Promise<Ronda[]> {
  const supabase = await crearClienteServidor();

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, numero, creado_en, estado")
    .eq("cuenta_id", cuentaId)
    .eq("comercio_id", comercioId)
    .order("creado_en", { ascending: false });

  if (!pedidos || pedidos.length === 0) return [];

  const pedidoIds = pedidos.map((pedido) => pedido.id);

  const { data: items } = await supabase
    .from("pedido_items")
    .select(
      "id, pedido_id, nombre, categoria_nombre, precio_unitario, cantidad, nota, estado",
    )
    .eq("comercio_id", comercioId)
    .in("pedido_id", pedidoIds)
    .order("nombre", { ascending: true });

  const itemIds = (items ?? []).map((item) => item.id);

  const { data: adicionales } =
    itemIds.length > 0
      ? await supabase
          .from("pedido_item_adicionales")
          .select("item_id, nombre, precio_extra")
          .eq("comercio_id", comercioId)
          .in("item_id", itemIds)
      : { data: [] };

  const adicionalesPorItem = new Map<
    string,
    { nombre: string; precioExtra: number }[]
  >();
  for (const adicional of adicionales ?? []) {
    const lista = adicionalesPorItem.get(adicional.item_id) ?? [];
    lista.push({ nombre: adicional.nombre, precioExtra: adicional.precio_extra });
    adicionalesPorItem.set(adicional.item_id, lista);
  }

  const itemsPorPedido = new Map<string, RondaItem[]>();
  for (const item of items ?? []) {
    const lista = itemsPorPedido.get(item.pedido_id) ?? [];
    lista.push({
      id: item.id,
      nombre: item.nombre,
      categoriaNombre: item.categoria_nombre,
      precioUnitario: item.precio_unitario,
      cantidad: item.cantidad,
      nota: item.nota,
      estado: item.estado,
      adicionales: adicionalesPorItem.get(item.id) ?? [],
    });
    itemsPorPedido.set(item.pedido_id, lista);
  }

  return pedidos.map((pedido) => ({
    id: pedido.id,
    numero: pedido.numero,
    creadoEn: pedido.creado_en,
    confirmado: pedido.estado === "confirmado",
    cancelado: pedido.estado === "cancelado",
    items: itemsPorPedido.get(pedido.id) ?? [],
  }));
}

export default async function PaginaSalonMesa({
  params,
}: PageProps<"/app/salon/[id]">) {
  const { id } = await params;

  // Autorización propia, sin depender del menú: dueño o mozo, con plan que
  // incluya salón.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mozo") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  // RLS: `mesas_leer` (es_miembro) ya lo permite; se filtra por
  // comercio_id acá para que un id de otro comercio dé 404 en vez de un
  // permiso denegado ambiguo.
  const supabase = await crearClienteServidor();
  const { data: mesa } = await supabase
    .from("mesas")
    .select("id, nombre, zonas(nombre)")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!mesa) {
    notFound();
  }

  // Si no tiene cuenta abierta, no hay nada que detallar acá — vuelve al
  // listado, donde va a aparecer como libre para abrirla desde ahí.
  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("id, abierta_en, perfiles(nombre)")
    .eq("mesa_id", id)
    .eq("comercio_id", contexto.comercio.id)
    .eq("estado", "abierta")
    .maybeSingle();

  if (!cuenta) {
    redirect("/app/salon?error=sin_cuenta");
  }

  const [categorias, rondas] = await Promise.all([
    obtenerCategoriasParaPedir(contexto.comercio.slug),
    obtenerRondas(contexto.comercio.id, cuenta.id),
  ]);
  const accesosRapidos = await obtenerAccesosRapidos(
    contexto.comercio.id,
    categorias,
  );

  // Lo que cocina ya terminó, de la ronda más vieja a la más nueva: lo que
  // espera hace más tiempo se lleva primero.
  const listos = rondas
    .filter((ronda) => ronda.confirmado)
    .toReversed()
    .flatMap((ronda) =>
      ronda.items
        .filter((item) => item.estado === "listo")
        .map((item) => ({ ...item, rondaNumero: ronda.numero })),
    );
  const unidadesListas = listos.reduce((suma, item) => suma + item.cantidad, 0);

  // Para cerrar la cuenta: lo consumido (sin lo cancelado) y lo que falta
  // entregar. La base lo vuelve a contar al cerrar; esto es para mostrar.
  const itemsCobrables = rondas
    .filter((ronda) => !ronda.cancelado)
    .flatMap((ronda) => ronda.items);
  const resumen = armarResumen(itemsCobrables);
  const pendientes = {
    pendiente: itemsCobrables.filter((i) => i.estado === "pendiente").length,
    en_preparacion: itemsCobrables.filter((i) => i.estado === "en_preparacion")
      .length,
    listo: itemsCobrables.filter((i) => i.estado === "listo").length,
  };

  return (
    <div className="space-y-6 pb-8">
      <ActualizarEnVivo
        comercioId={contexto.comercio.id}
        cuentaId={cuenta.id}
        escucharCarta
      />

      <Link
        href="/app/salon"
        className="inline-block text-base font-medium text-neutral-600"
      >
        ← Mesas
      </Link>

      {listos.length > 0 && (
        <section className="space-y-3 rounded-2xl border-4 border-blue-600 bg-blue-50 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold text-blue-900">
              Listo para llevar
            </h2>
            <span className="text-base font-semibold text-blue-800">
              {unidadesListas} {unidadesListas === 1 ? "plato" : "platos"}
            </span>
          </div>

          {listos.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"
            >
              <div className="min-w-0">
                <p className="text-lg font-bold text-neutral-900">
                  {item.cantidad}× {item.nombre}
                </p>
                {item.categoriaNombre && (
                  <p className="text-sm text-neutral-500">
                    {item.categoriaNombre}
                  </p>
                )}
                {item.adicionales.length > 0 && (
                  <p className="text-sm text-neutral-600">
                    {item.adicionales.map((a) => a.nombre).join(", ")}
                  </p>
                )}
                {item.nota && (
                  <p className="text-sm font-semibold text-amber-800">
                    &quot;{item.nota}&quot;
                  </p>
                )}
                <p className="text-xs text-neutral-400">
                  Ronda #{item.rondaNumero ?? "—"}
                </p>
              </div>
              <form action={marcarEntregado.bind(null, mesa.id, item.id)}>
                <BotonEnvio
                  textoPendiente="…"
                  className="min-h-14 min-w-28 rounded-xl bg-blue-600 px-4 text-base font-bold text-white active:bg-blue-700"
                >
                  Entregar
                </BotonEnvio>
              </form>
            </div>
          ))}

          {listos.length > 1 && (
            <form action={marcarTodoEntregado.bind(null, mesa.id)}>
              <BotonEnvio
                textoPendiente="Entregando…"
                className="min-h-16 w-full rounded-2xl bg-blue-700 px-5 text-xl font-bold text-white active:bg-blue-800"
              >
                Entregar todo ({unidadesListas})
              </BotonEnvio>
            </form>
          )}
        </section>
      )}

      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
        <p className="text-sm font-semibold tracking-wide text-amber-700 uppercase">
          {mesa.zonas?.nombre ?? "—"}
        </p>
        <p className="mt-1 text-4xl font-bold text-neutral-900">
          {mesa.nombre}
        </p>
        <p className="mt-4 text-lg font-semibold text-amber-800">
          ● Ocupada
        </p>
        <p className="mt-1 text-base text-amber-700">
          Abierta {formatearTiempoAbierta(cuenta.abierta_en)}
          {cuenta.perfiles?.nombre && ` por ${cuenta.perfiles.nombre}`}
        </p>
      </div>

      <CargaPedido
        cuentaId={cuenta.id}
        categorias={categorias}
        accesosRapidos={accesosRapidos}
      />

      {rondas.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-neutral-900">
            Rondas de esta mesa
          </h2>
          {rondas.map((ronda) => (
            <div
              key={ronda.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-neutral-900">
                  Ronda #{ronda.numero ?? "—"}
                </p>
                <p className="text-sm text-neutral-500">
                  {formateadorHora.format(new Date(ronda.creadoEn))}
                </p>
              </div>
              <div className="mt-2 space-y-1.5">
                {ronda.items.map((item) => (
                  <div key={item.id} className="flow-root text-sm text-neutral-700">
                    <span
                      className={`float-right ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${ESTADO_ITEM[item.estado].clase}`}
                    >
                      {ESTADO_ITEM[item.estado].texto}
                    </span>
                    <p>
                      <span className="font-semibold text-neutral-900">
                        {item.cantidad}×
                      </span>{" "}
                      {item.nombre}
                      {item.adicionales.length > 0 && (
                        <span className="text-neutral-500">
                          {" "}
                          ({item.adicionales.map((a) => a.nombre).join(", ")})
                        </span>
                      )}
                      {item.nota && (
                        <span className="text-neutral-500 italic">
                          {" "}
                          — &quot;{item.nota}&quot;
                        </span>
                      )}
                      <span className="text-neutral-400">
                        {" "}
                        · {formateadorPrecio.format(item.precioUnitario)}
                      </span>
                    </p>
                    {item.categoriaNombre && (
                      <p className="text-xs text-neutral-400">
                        {item.categoriaNombre}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CerrarCuenta
        mesaId={mesa.id}
        mesaNombre={mesa.nombre}
        resumen={resumen}
        pendientes={pendientes}
      />
    </div>
  );
}
