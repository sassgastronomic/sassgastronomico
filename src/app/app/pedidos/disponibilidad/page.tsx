import Link from "next/link";
import { redirect } from "next/navigation";

import { DisponibilidadEnVivo } from "@/components/disponibilidad/disponibilidad-en-vivo";
import { ListaDisponibilidad } from "@/components/disponibilidad/lista-disponibilidad";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteTakeAway } from "@/lib/comercios/validacion";
import { obtenerDisponibilidad } from "@/lib/disponibilidad/disponibilidad";

// Las solapas de pedidos, como links de vuelta a /app/pedidos.
const SOLAPAS_PEDIDOS = [
  { pestana: "nuevo", etiqueta: "Nuevos" },
  { pestana: "en_cocina", etiqueta: "En cocina" },
  { pestana: "listo", etiqueta: "Listos para entregar" },
] as const;

/**
 * Disponibilidad desde el mostrador: lo mismo que la solapa de cada sector,
 * pero de todos los sectores, con lo que está sin stock arriba de todo
 * para reactivarlo apenas reponen. Marcar y listo, sin confirmaciones.
 *
 * Acceso: el mismo que /app/pedidos (dueño o mostrador, plan con take
 * away). Sin redirigir por el plan, por la misma razón que allá (/app
 * manda al mostrador a los pedidos solo si el plan lo tiene).
 */
export default async function PaginaDisponibilidadMostrador() {
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
        <h1 className="text-2xl font-bold text-neutral-900">Disponibilidad</h1>
        <p className="text-base text-neutral-500">
          El plan de este comercio no incluye pedidos online.
        </p>
      </div>
    );
  }

  const sectores = await obtenerDisponibilidad(contexto.comercio);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Pedidos online</h1>
        <p className="text-sm text-neutral-500">
          Qué hay y qué se acabó, en todos los sectores.
        </p>
      </div>

      <nav
        aria-label="Secciones del mostrador"
        className="flex gap-1 overflow-x-auto rounded-2xl bg-neutral-100 p-1.5"
      >
        {SOLAPAS_PEDIDOS.map((solapa) => (
          <Link
            key={solapa.pestana}
            href={`/app/pedidos?pestana=${solapa.pestana}`}
            className="flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-base font-semibold whitespace-nowrap text-neutral-600 hover:bg-white/60"
          >
            {solapa.etiqueta}
          </Link>
        ))}
        <span
          aria-current="page"
          className="flex flex-1 items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-semibold whitespace-nowrap text-neutral-900 shadow-sm"
        >
          Disponibilidad
        </span>
      </nav>

      <DisponibilidadEnVivo
        comercioId={contexto.comercio.id}
        sectorId={null}
        hrefPedidos="/app/pedidos"
      />

      <ListaDisponibilidad
        sectores={sectores}
        mostrarSectores
        vacio="La carta no tiene productos todavía."
      />
    </div>
  );
}
