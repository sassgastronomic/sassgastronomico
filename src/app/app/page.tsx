import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteTakeAway } from "@/lib/comercios/validacion";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import type { PlanComercio } from "@/types/database";

const ETIQUETA_PLAN: Record<PlanComercio, string> = {
  take_away: "Take away",
  salon: "Salón",
  completo: "Completo",
};

export default async function PaginaApp() {
  const contexto = await obtenerContextoComercio();

  // El layout (src/app/app/layout.tsx) ya filtra sin_membresia/suspendido
  // antes de que se llegue a renderizar esta página. Este chequeo es solo
  // para angostar el tipo de `contexto` acá.
  if (contexto.tipo !== "activo") {
    return null;
  }

  const { comercio, rol, usuario, sectoresAsignados } = contexto;

  // El login manda a todos acá. El mozo, el mostrador y la cocina tienen
  // una sola pantalla de trabajo: entran directo a ella en vez de a este
  // inicio vacío. Cuidado con los bucles: /app/salon y /app/sector/[id]
  // rebotan a /app cuando no corresponde, así que solo se redirige con las
  // mismas condiciones que esas páginas aceptan (plan con salón para el
  // mozo; plan con take away para el mostrador; un sector que el miembro
  // tiene asignado).
  if (rol === "mozo" && planPermiteSalon(comercio.plan)) {
    redirect("/app/salon");
  }
  if (rol === "mostrador" && planPermiteTakeAway(comercio.plan)) {
    redirect("/app/pedidos");
  }
  if (rol === "sector" && sectoresAsignados.length === 1) {
    redirect(`/app/sector/${sectoresAsignados[0].id}`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-neutral-900">
          Hola, {usuario.nombre}
        </h1>
        <p className="text-sm text-neutral-500">
          {comercio.nombre} · Plan {ETIQUETA_PLAN[comercio.plan]}
        </p>
      </div>

      {/* Alguien que atiende más de un sector (ej. cocina y barra en un
          local chico) elige acá cuál abrir: botones grandes, es la misma
          tablet o celular de trabajo. */}
      {rol === "sector" && sectoresAsignados.length > 1 && (
        <div className="space-y-3">
          <p className="text-base font-semibold text-neutral-900">
            ¿Qué pantalla abrís?
          </p>
          {sectoresAsignados.map((sector) => (
            <Link
              key={sector.id}
              href={`/app/sector/${sector.id}`}
              className="block rounded-2xl border-2 border-neutral-200 bg-white px-5 py-5 text-xl font-bold text-neutral-900 active:bg-neutral-50"
            >
              {sector.nombre}
            </Link>
          ))}
        </div>
      )}

      {rol === "sector" && sectoresAsignados.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">
          Todavía no tenés ningún sector asignado. Pedile al dueño que te
          asigne la cocina o la barra desde Usuarios.
        </p>
      )}
    </div>
  );
}
