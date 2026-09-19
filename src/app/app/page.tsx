import { obtenerContextoComercio } from "@/lib/comercio/contexto";
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

  const { comercio, usuario } = contexto;

  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold text-neutral-900">
        Hola, {usuario.nombre || usuario.email}
      </h1>
      <p className="text-sm text-neutral-500">
        {comercio.nombre} · Plan {ETIQUETA_PLAN[comercio.plan]}
      </p>
    </div>
  );
}
