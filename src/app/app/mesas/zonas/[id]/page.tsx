import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarZona } from "./formulario";

export default async function PaginaEditarZona({
  params,
}: PageProps<"/app/mesas/zonas/[id]">) {
  const { id } = await params;

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

  // RLS: `zonas_leer` (es_miembro) ya lo permite; igual se filtra por
  // comercio_id acá para que un id de otro comercio dé 404, no un permiso
  // denegado ambiguo.
  const { data: zona } = await supabase
    .from("zonas")
    .select("id, nombre, activo")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!zona) {
    notFound();
  }

  // Si alguna mesa de la zona tiene una cuenta abierta ahora, no se va a
  // poder desactivar (el bloqueo real está en la Server Action). Acá solo
  // sirve para deshabilitar la opción en el <select> y explicar por qué de
  // entrada — mismo criterio que mesas/[id]/page.tsx.
  const { data: mesasZona } = await supabase
    .from("mesas")
    .select("id")
    .eq("zona_id", id)
    .eq("comercio_id", contexto.comercio.id);

  let tieneCuentaAbierta = false;
  const idsMesas = (mesasZona ?? []).map((mesa) => mesa.id);
  if (idsMesas.length > 0) {
    const { data: cuentaAbierta } = await supabase
      .from("cuentas")
      .select("id")
      .in("mesa_id", idsMesas)
      .eq("comercio_id", contexto.comercio.id)
      .eq("estado", "abierta")
      .limit(1)
      .maybeSingle();
    tieneCuentaAbierta = cuentaAbierta !== null;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/mesas/zonas"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Zonas
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">{zona.nombre}</h1>
      <FormularioEditarZona zona={zona} tieneCuentaAbierta={tieneCuentaAbierta} />
    </div>
  );
}
