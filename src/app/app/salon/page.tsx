import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerCajaAbierta } from "@/lib/caja/caja";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { obtenerZonasConMesas } from "@/lib/salon/mesas";
import { crearClienteServidor } from "@/lib/supabase/server";

import { ActualizarEnVivo } from "./actualizar-en-vivo";
import { ListadoSalon, type ZonaSalon } from "./listado";

const MENSAJE_ERROR: Record<string, string> = {
  mesa_ocupada:
    "Esa mesa ya la abrió otro mozo justo ahora. Se actualizó la pantalla.",
  mesa_no_disponible: "Esa mesa ya no está disponible.",
  no_se_pudo_abrir: "No se pudo abrir la mesa. Probá de nuevo.",
  sin_cuenta: "Esa mesa ya no tiene una cuenta abierta: puede que la hayan cerrado.",
};

/**
 * Las zonas con sus mesas (`@/lib/salon/mesas`, compartido con
 * /app/qr/[codigo]) más lo que esta pantalla necesita de propio: cuántos
 * ítems tiene cada cuenta listos para llevar. Una consulta más, de tamaño
 * fijo, nada de una por mesa.
 */
async function obtenerZonasParaAtender(
  comercioId: string,
): Promise<ZonaSalon[]> {
  const zonas = await obtenerZonasConMesas(comercioId);

  const cuentaIds = zonas
    .flatMap((zona) => zona.mesas)
    .map((mesa) => mesa.cuenta?.id)
    .filter((id): id is string => id !== undefined);

  // Ítems listos (cocina ya los terminó) de pedidos confirmados de las
  // cuentas abiertas. Se cuentan unidades, no líneas: "2× Lomito" son dos
  // platos para llevar.
  const supabase = await crearClienteServidor();
  const { data: listos } =
    cuentaIds.length > 0
      ? await supabase
          .from("pedido_items")
          .select("cantidad, pedidos!inner(cuenta_id, estado)")
          .eq("comercio_id", comercioId)
          .eq("estado", "listo")
          .eq("pedidos.estado", "confirmado")
          .in("pedidos.cuenta_id", cuentaIds)
      : { data: [] };

  const listosPorCuenta = new Map<string, number>();
  for (const item of listos ?? []) {
    const cuentaId = item.pedidos.cuenta_id;
    if (!cuentaId) continue;
    listosPorCuenta.set(
      cuentaId,
      (listosPorCuenta.get(cuentaId) ?? 0) + item.cantidad,
    );
  }

  return zonas.map((zona) => ({
    id: zona.id,
    nombre: zona.nombre,
    mesas: zona.mesas.map((mesa) => ({
      id: mesa.id,
      nombre: mesa.nombre,
      cuenta:
        mesa.cuenta === null
          ? null
          : {
              abiertaEn: mesa.cuenta.abiertaEn,
              listos: listosPorCuenta.get(mesa.cuenta.id) ?? 0,
            },
    })),
  }));
}

export default async function PaginaSalon({
  searchParams,
}: PageProps<"/app/salon">) {
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

  const parametros = await searchParams;
  const codigoError =
    typeof parametros.error === "string" ? parametros.error : undefined;

  const zonas = await obtenerZonasParaAtender(contexto.comercio.id);
  const cajaAbierta = (await obtenerCajaAbierta(contexto.comercio.id)) !== null;

  // "caja_cerrada" no se muestra como error: si sigue cerrada ya está el
  // aviso fijo de abajo, y si la abrieron mientras tanto, quedó viejo.
  const mensajeError =
    codigoError && codigoError !== "caja_cerrada"
      ? MENSAJE_ERROR[codigoError]
      : undefined;

  // Lo primero que mira el mozo al entrar: qué tiene para llevar. Va
  // arriba de las zonas (que pueden estar plegadas) para que nunca quede
  // escondido.
  const mesasConListos = zonas.flatMap((zona) =>
    zona.mesas.filter((mesa) => (mesa.cuenta?.listos ?? 0) > 0),
  );

  return (
    <div className="space-y-6 pb-8">
      <ActualizarEnVivo comercioId={contexto.comercio.id} />

      <h1 className="text-xl font-semibold text-neutral-900">
        Atender mesas
      </h1>

      {mesasConListos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold tracking-wide text-blue-800 uppercase">
            Listo para llevar
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {mesasConListos.map((mesa) => (
              <Link
                key={mesa.id}
                href={`/app/salon/${mesa.id}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-blue-600 px-5 py-4 text-white active:bg-blue-700"
              >
                <span className="text-xl font-bold">{mesa.nombre}</span>
                <span className="text-base font-semibold">
                  {mesa.cuenta?.listos} para llevar →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sin caja no se abren mesas ni se cargan rondas (la base lo
          rechaza). El mozo no puede abrirla: se lo pide al mostrador. Se
          actualiza solo cuando la abren (ActualizarEnVivo escucha cajas). */}
      {!cajaAbierta && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-base text-amber-950"
        >
          <strong className="font-bold">La caja no está abierta.</strong>{" "}
          Pedile al mostrador que la abra para empezar a atender mesas.
        </p>
      )}

      {mensajeError && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800"
        >
          {mensajeError}
        </p>
      )}

      {zonas.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="text-base text-neutral-500">
            No hay mesas activas para atender todavía.
          </p>
        </div>
      )}

      {zonas.length > 0 && (
        <ListadoSalon
          cajaAbierta={cajaAbierta}
          zonas={zonas}
          comercioId={contexto.comercio.id}
          usuarioId={contexto.usuario.id}
        />
      )}
    </div>
  );
}
