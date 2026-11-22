import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DisponibilidadEnVivo } from "@/components/disponibilidad/disponibilidad-en-vivo";
import { ListaDisponibilidad } from "@/components/disponibilidad/lista-disponibilidad";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { obtenerDisponibilidad } from "@/lib/disponibilidad/disponibilidad";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Disponibilidad de un sector: los productos que prepara (sector
 * efectivo), cada uno con su interruptor de "sin stock". Es la tercera
 * solapa de la pantalla del sector: cuando se acaba algo, quien se entera
 * primero es la cocina, y marcarlo acá lo saca de la carta enseguida.
 * Nada más: precios, nombres, categorías y el `activo` son del dueño.
 *
 * Acceso: el mismo que la pantalla del sector (dueño, o rol `sector` con
 * este sector asignado). La Server Action y la función de la base lo
 * vuelven a validar por su cuenta.
 */
export default async function PaginaDisponibilidadSector({
  params,
}: PageProps<"/app/sector/[id]/disponibilidad">) {
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

  const supabase = await crearClienteServidor();
  const { data: sector } = await supabase
    .from("sectores")
    .select("id, nombre, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .maybeSingle();

  if (!sector) {
    notFound();
  }

  const sectores = await obtenerDisponibilidad(contexto.comercio, sector.id);
  const base = `/app/sector/${sector.id}`;

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-3xl font-black text-neutral-900">{sector.nombre}</h1>

      {/* Mismas solapas que la pantalla del sector: las dos primeras
          vuelven a ella. */}
      <nav aria-label="Secciones del sector" className="flex flex-wrap gap-2">
        <Link
          href={base}
          className="rounded-full border-2 border-neutral-300 bg-white px-6 py-3 text-lg font-bold text-neutral-700 active:bg-neutral-100"
        >
          En cocina
        </Link>
        <Link
          href={`${base}?solapa=listos`}
          className="rounded-full border-2 border-neutral-300 bg-white px-6 py-3 text-lg font-bold text-neutral-700 active:bg-neutral-100"
        >
          Listos
        </Link>
        <span
          aria-current="page"
          className="rounded-full bg-neutral-900 px-6 py-3 text-lg font-bold text-white"
        >
          Disponibilidad
        </span>
      </nav>

      <DisponibilidadEnVivo
        comercioId={contexto.comercio.id}
        sectorId={sector.id}
        hrefPedidos={base}
      />

      <ListaDisponibilidad
        sectores={sectores}
        mostrarSectores={false}
        vacio={
          sector.activo
            ? "Este sector no tiene productos en la carta."
            : "Este sector está inactivo: sus productos no están en la carta."
        }
      />
    </div>
  );
}
