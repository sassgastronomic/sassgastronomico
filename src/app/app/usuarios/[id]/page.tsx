import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteRol } from "@/lib/miembros/plan";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarUsuario } from "./formulario";

export default async function PaginaEditarUsuario({
  params,
}: PageProps<"/app/usuarios/[id]">) {
  const { id } = await params;

  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // RLS: `miembros_duenio` (tiene_rol duenio) ya lo permite; igual se
  // filtra por comercio_id acá para que un id de otro comercio dé 404, no
  // un permiso denegado ambiguo.
  const { data: miembro } = await supabase
    .from("miembros")
    .select(
      "id, rol, activo, perfil_id, perfiles(nombre, usuario), miembro_sectores(sector_id)",
    )
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!miembro || !miembro.perfiles) {
    notFound();
  }

  // El dueño no se edita desde acá (ni a sí mismo ni, por construcción, a
  // otro dueño: solo hay uno por comercio, ver el índice único al final de
  // supabase/migrations/). Se trata como si no existiera esta pantalla.
  if (miembro.rol === "duenio" || miembro.perfil_id === contexto.usuario.id) {
    redirect("/app/usuarios");
  }

  // Todos los sectores del comercio (no solo los activos): si alguno de los
  // ya asignados dejó de estar activo, tiene que poder seguir apareciendo
  // seleccionado en vez de perderse — mismo criterio que el sector de una
  // categoría o la categoría de un producto en /app/carta.
  const { data: sectores } = await supabase
    .from("sectores")
    .select("id, nombre, activo")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  const sectorIdsAsignados = miembro.miembro_sectores.map(
    (asignacion) => asignacion.sector_id,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/app/usuarios"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Usuarios
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">
        {miembro.perfiles.nombre}
      </h1>
      <FormularioEditarUsuario
        miembro={{
          id: miembro.id,
          rol: miembro.rol,
          activo: miembro.activo,
          nombre: miembro.perfiles.nombre,
          usuario: miembro.perfiles.usuario,
        }}
        sectores={sectores ?? []}
        sectorIdsAsignados={sectorIdsAsignados}
        permiteMozo={planPermiteRol(contexto.comercio.plan, "mozo")}
      />
    </div>
  );
}
