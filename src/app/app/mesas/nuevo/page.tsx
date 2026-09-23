import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioNuevaMesa } from "./formulario";

export default async function PaginaNuevaMesa() {
  // Autorización propia, sin depender del menú: solo dueño, y solo si el
  // plan incluye salón.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: zonas } = await supabase
    .from("zonas")
    .select("id, nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const zonasActivas = zonas ?? [];

  if (zonasActivas.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/mesas"
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Mesas
        </Link>
        <h1 className="text-xl font-semibold text-neutral-900">
          Crear mesas
        </h1>
        <div className="max-w-xl rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="mb-4 text-sm text-neutral-500">
            Necesitás al menos una zona activa para crear una mesa.
          </p>
          <Link
            href="/app/mesas/zonas/nuevo"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear zona
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/mesas"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Mesas
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Crear mesas</h1>
      <FormularioNuevaMesa zonas={zonasActivas} />
    </div>
  );
}
