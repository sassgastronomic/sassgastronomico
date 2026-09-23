import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";

import { FormularioNuevaZona } from "./formulario";

export default async function PaginaNuevaZona() {
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

  return (
    <div className="space-y-6">
      <Link
        href="/app/mesas/zonas"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Zonas
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Crear zona</h1>
      <FormularioNuevaZona />
    </div>
  );
}
