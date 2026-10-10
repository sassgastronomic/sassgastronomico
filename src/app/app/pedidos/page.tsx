import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteTakeAway } from "@/lib/comercios/validacion";
import { linkSeguimiento, origenDelRequest } from "@/lib/landing/link";
import { subtotalLinea, sumarMontos } from "@/lib/landing/precios";
import { mensajeLinkSeguimiento } from "@/lib/landing/whatsapp";
import { formatearTiempoAbierta } from "@/lib/salon/tiempo";
import { crearClienteServidor } from "@/lib/supabase/server";

import { PantallaMostrador, type PedidoMostrador } from "./pantalla-mostrador";

function masNuevo(fechas: (string | null)[]): string | null {
  return fechas.reduce<string | null>(
    (ultima, fecha) =>
      fecha && (!ultima || new Date(fecha) > new Date(ultima)) ? fecha : ultima,
    null,
  );
}

/**
 * Los pedidos online del comercio que todavía necesitan algo del local:
 * pendientes (para aceptar o rechazar) y aceptados (en cocina o listos
 * para entregar). Los entregados y cancelados ya no aparecen. Las rondas
 * de salón no: tienen su circuito propio (mozo, cuentas).
 *
 * Los "hace X" se calculan acá, en el servidor (mismo criterio que salón y
 * cocina): la pantalla se vuelve a pedir sola con cada cambio y cada
 * minuto.
 */
async function obtenerPedidosOnline(
  comercioId: string,
  slug: string,
): Promise<PedidoMostrador[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero, estado, modalidad, cliente_nombre, direccion, nota, creado_en, confirmado_en, codigo_seguimiento, pedido_items(id, nombre, categoria_nombre, precio_unitario, cantidad, nota, estado, listo_en, pedido_item_adicionales(nombre, precio_extra))",
    )
    .eq("comercio_id", comercioId)
    .eq("origen", "landing")
    .in("estado", ["pendiente_confirmar", "confirmado"])
    .order("creado_en", { ascending: true });

  // Un error de base no es "no hay pedidos": va al error boundary, que
  // ofrece reintentar.
  if (error) throw new Error(`pedidos online: ${error.message}`);

  const origen = await origenDelRequest();

  return (data ?? []).map((pedido) => {
    const items = [...pedido.pedido_items]
      .sort(
        (a, b) =>
          (a.categoria_nombre ?? "").localeCompare(b.categoria_nombre ?? "") ||
          a.nombre.localeCompare(b.nombre),
      )
      .map((item) => ({
        id: item.id,
        nombre: item.nombre,
        categoriaNombre: item.categoria_nombre,
        cantidad: item.cantidad,
        nota: item.nota,
        estado: item.estado,
        adicionales: item.pedido_item_adicionales.map((adicional) => ({
          nombre: adicional.nombre,
          precioExtra: adicional.precio_extra,
        })),
        subtotal: subtotalLinea(
          item.precio_unitario,
          item.pedido_item_adicionales.map((adicional) => adicional.precio_extra),
          item.cantidad,
        ),
      }));

    const listos = items.filter(
      (item) => item.estado === "listo" || item.estado === "entregado",
    ).length;
    const etapa =
      pedido.estado === "pendiente_confirmar"
        ? "nuevo"
        : items.length > 0 && listos === items.length
          ? "listo"
          : "en_cocina";

    // Desde cuándo: recibido (nuevo), aceptado (en cocina), o cuando cocina
    // terminó lo último (listo).
    const desde =
      etapa === "nuevo"
        ? pedido.creado_en
        : etapa === "listo"
          ? (masNuevo(pedido.pedido_items.map((item) => item.listo_en)) ??
            pedido.confirmado_en ??
            pedido.creado_en)
          : (pedido.confirmado_en ?? pedido.creado_en);

    const link = pedido.codigo_seguimiento
      ? linkSeguimiento(origen, slug, pedido.codigo_seguimiento)
      : null;

    return {
      id: pedido.id,
      numero: pedido.numero,
      etapa,
      modalidad: pedido.modalidad,
      clienteNombre: pedido.cliente_nombre ?? "",
      direccion: pedido.direccion,
      nota: pedido.nota,
      desde,
      hace: formatearTiempoAbierta(desde),
      link,
      mensajeLink:
        link && pedido.numero !== null
          ? mensajeLinkSeguimiento({
              numero: pedido.numero,
              cliente_nombre: pedido.cliente_nombre ?? "",
              link,
            })
          : null,
      items,
      listos,
      total: sumarMontos(items.map((item) => item.subtotal)),
    };
  });
}

/**
 * Pantalla de mostrador: donde el local acepta los pedidos online (y ahí
 * se convierten en comanda: cocina los ve igual que una ronda de salón),
 * los entrega y, si hace falta, los cancela.
 *
 * Acceso: dueño o mostrador, con un plan que tenga take away. Sin
 * redirigir en ese último caso: /app manda al mostrador acá solo si el
 * plan lo tiene, y redirigir de vuelta armaría un bucle.
 */
export default async function PaginaPedidos() {
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mostrador") {
    redirect("/app");
  }

  if (!planPermiteTakeAway(contexto.comercio.plan)) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-neutral-900">Pedidos online</h1>
        <p className="text-base text-neutral-500">
          El plan de este comercio no incluye pedidos online.
        </p>
      </div>
    );
  }

  const pedidos = await obtenerPedidosOnline(
    contexto.comercio.id,
    contexto.comercio.slug,
  );

  return (
    <PantallaMostrador comercioId={contexto.comercio.id} pedidos={pedidos} />
  );
}
