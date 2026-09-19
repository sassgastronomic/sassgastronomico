import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";

import { FormularioNuevoSector } from "./formulario";

export default async function PaginaNuevoSector() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/carta/sectores"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Sectores
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        Crear sector
      </h1>
      <FormularioNuevoSector />
    </div>
  );
}
