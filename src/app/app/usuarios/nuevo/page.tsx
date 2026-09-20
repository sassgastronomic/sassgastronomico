import Link from "next/link";
import { redirect } from "next/navigation";

import { planPermiteRol } from "@/lib/miembros/plan";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioNuevoUsuario } from "./formulario";

export default async function PaginaNuevoUsuario() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // Mismo criterio que el botón "Crear usuario" del listado: si ya no hay
  // lugar, ni se muestra el formulario (por si alguien llega directo a esta
  // URL). La Server Action vuelve a chequear esto antes de crear nada — acá
  // es solo para no mostrar un formulario que va a fallar seguro.
  const { data: ocupados } = await supabase.rpc("usuarios_ocupados", {
    p_comercio: contexto.comercio.id,
  });

  if (ocupados !== null && ocupados >= contexto.comercio.limite_usuarios) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/usuarios"
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Usuarios
        </Link>
        <h1 className="text-xl font-semibold text-neutral-900">
          Crear usuario
        </h1>
        <div className="max-w-xl rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="text-sm text-neutral-500">
            Llegaste al límite de {contexto.comercio.limite_usuarios} usuarios
            de tu plan. Desactivá a alguien o pedí una ampliación para poder
            crear uno nuevo.
          </p>
        </div>
      </div>
    );
  }

  const { data: sectores } = await supabase
    .from("sectores")
    .select("id, nombre")
    .eq("comercio_id", contexto.comercio.id)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  return (
    <div className="space-y-6">
      <Link
        href="/app/usuarios"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Usuarios
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Crear usuario</h1>
      <FormularioNuevoUsuario
        sectores={sectores ?? []}
        permiteMozo={planPermiteRol(contexto.comercio.plan, "mozo")}
        comercioSlug={contexto.comercio.slug}
      />
    </div>
  );
}
