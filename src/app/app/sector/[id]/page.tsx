import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { PantallaSector, type PedidoConItems } from "./pantalla-sector";

/**
 * Ítems de este sector todavía sin entregar (pendiente, en preparación o
 * listo — el filtro por solapa lo hace el cliente, ver pantalla-sector.tsx),
 * solo de pedidos `confirmado` (docs/SCHEMA.md, "Estados"): un pedido de la
 * landing sin aceptar o uno cancelado no tiene que llegar a la cocina.
 * Agrupados por pedido y ordenados por antigüedad del pedido (el más
 * viejo primero: lo que entró antes se prepara antes). La antigüedad de un
 * pedido online cuenta desde que el mostrador lo aceptó (`confirmado_en`),
 * no desde que el cliente lo hizo: hasta aceptarlo, la cocina ni lo veía,
 * y contarle ese rato lo marcaría demorado de entrada. Una sola consulta,
 * con `pedidos`/`cuentas`/`mesas` y `pedido_item_adicionales` embebidos —
 * nada de una consulta por ítem ni por pedido.
 */
async function obtenerItemsDeSector(
  comercioId: string,
  sectorId: string,
): Promise<PedidoConItems[]> {
  const supabase = await crearClienteServidor();

  // `pedidos!inner`: sin el inner join, filtrar por `pedidos.estado` solo
  // dejaría el pedido embebido en null, pero el ítem vendría igual.
  const { data: items } = await supabase
    .from("pedido_items")
    .select(
      "id, pedido_id, nombre, categoria_nombre, cantidad, nota, estado, pedido_item_adicionales(nombre), pedidos!inner(numero, origen, creado_en, confirmado_en, estado, cliente_nombre, modalidad, nota, cuentas(mesas(nombre)))",
    )
    .eq("comercio_id", comercioId)
    .eq("sector_id", sectorId)
    .neq("estado", "entregado")
    .eq("pedidos.estado", "confirmado")
    .order("nombre", { ascending: true });

  if (!items) return [];

  const pedidosPorId = new Map<string, PedidoConItems>();
  for (const item of items) {
    // No debería pasar (pedido_id es NOT NULL y la misma RLS que deja ver
    // el ítem deja ver su pedido), pero si pasara, mejor saltear el ítem
    // que romper toda la pantalla.
    if (!item.pedidos) continue;

    let pedido = pedidosPorId.get(item.pedido_id);
    if (!pedido) {
      const esOnline = item.pedidos.origen === "landing";
      pedido = {
        id: item.pedido_id,
        numero: item.pedidos.numero,
        inicio:
          esOnline && item.pedidos.confirmado_en
            ? item.pedidos.confirmado_en
            : item.pedidos.creado_en,
        mesaNombre: item.pedidos.cuentas?.mesas?.nombre ?? null,
        online: esOnline
          ? {
              cliente: item.pedidos.cliente_nombre ?? "",
              modalidad: item.pedidos.modalidad,
              nota: item.pedidos.nota,
            }
          : null,
        items: [],
      };
      pedidosPorId.set(item.pedido_id, pedido);
    }
    pedido.items.push({
      id: item.id,
      nombre: item.nombre,
      categoriaNombre: item.categoria_nombre,
      cantidad: item.cantidad,
      nota: item.nota,
      estado: item.estado,
      adicionales: item.pedido_item_adicionales.map((a) => a.nombre),
    });
  }

  return [...pedidosPorId.values()].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
  );
}

/**
 * Pantalla de un sector (cocina, barra, parrilla — el nombre lo pone cada
 * local). Antes eran rutas fijas /app/cocina y /app/barra; ahora hay una
 * por sector real — `miembro_sectores` define qué sector ve cada miembro
 * con rol `sector` (ver docs/SCHEMA.md, reemplaza el viejo matcheo por
 * nombre).
 *
 * Acceso: dueño o rol `sector` con este sector puntual asignado, esté
 * activo o no. Otros roles no llegan acá ni por el menú, pero se valida
 * igual por si alguien entra directo por la URL.
 *
 * A propósito NO se bloquea un sector inactivo (a diferencia de una mesa
 * cuya zona está inactiva, que sí se bloquea): esta pantalla muestra y
 * deja accionar pedidos ya tomados, no editar datos — un sector apagado
 * puede seguir teniendo pedidos pendientes de entregar, y bloquear la
 * pantalla dejaría esos pedidos sin nadie que los vea. Solo se avisa que
 * está inactivo, para que no se lo confunda con uno operando con
 * normalidad (mismo criterio de "no cascada, cada pantalla avisa lo que
 * corresponda" del resto de la carta — ver docs/SCHEMA.md).
 */
export default async function PaginaSector({
  params,
}: PageProps<"/app/sector/[id]">) {
  const { id } = await params;

  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }

  const esDuenio = contexto.rol === "duenio";
  const tieneSectorAsignado =
    contexto.rol === "sector" &&
    contexto.sectoresAsignados.some((sector) => sector.id === id);

  if (!esDuenio && !tieneSectorAsignado) {
    redirect("/app");
  }

  // RLS: `sectores_leer` (es_miembro) ya lo permite; se filtra por
  // comercio_id acá para que un id de otro comercio dé 404 en vez de un
  // permiso denegado ambiguo.
  const supabase = await crearClienteServidor();
  const { data: sector } = await supabase
    .from("sectores")
    .select("id, nombre, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!sector) {
    notFound();
  }

  const pedidos = await obtenerItemsDeSector(contexto.comercio.id, sector.id);

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-3xl font-black text-neutral-900">
        {sector.nombre}
      </h1>
      {!sector.activo && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-800">
          Este sector está inactivo. Puede tener pedidos pendientes de antes
          de apagarlo, pero no debería estar recibiendo pedidos nuevos.
        </p>
      )}

      <PantallaSector
        comercioId={contexto.comercio.id}
        sectorId={sector.id}
        pedidos={pedidos}
      />
    </div>
  );
}
