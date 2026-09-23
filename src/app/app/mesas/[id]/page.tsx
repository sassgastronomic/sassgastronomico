import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

import { FormularioEditarMesa } from "./formulario";

export default async function PaginaEditarMesa({
  params,
}: PageProps<"/app/mesas/[id]">) {
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

  // RLS: `mesas_leer` (es_miembro) ya lo permite; igual se filtra por
  // comercio_id acá para que un id de otro comercio dé 404, no un permiso
  // denegado ambiguo.
  const { data: mesa } = await supabase
    .from("mesas")
    .select("id, nombre, activo, zona_id")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (!mesa) {
    notFound();
  }

  // Todas las zonas del comercio (no solo las activas): si la zona actual
  // de la mesa ya no está activa, tiene que poder seguir apareciendo
  // seleccionada en vez de romper el <select> — mismo criterio que el
  // sector de una categoría en /app/carta.
  const { data: zonas } = await supabase
    .from("zonas")
    .select("id, nombre, activo")
    .eq("comercio_id", contexto.comercio.id)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  // Una zona inactiva arrastra su estado a todas sus mesas
  // (actualizar_zona_con_mesas): no tiene sentido dejar editar una mesa
  // individual mientras herede "Inactiva" de la zona — hay que activar la
  // zona primero.
  const zonaDeLaMesa = zonas?.find((zona) => zona.id === mesa.zona_id);
  if (zonaDeLaMesa && !zonaDeLaMesa.activo) {
    redirect("/app/mesas?zona_inactiva=1");
  }

  // Si tiene una cuenta abierta ahora, no se va a poder desactivar (el
  // bloqueo real está en la Server Action). Acá solo sirve para deshabilitar
  // la opción en el <select> y explicar por qué de entrada.
  const { data: cuentaAbierta } = await supabase
    .from("cuentas")
    .select("id")
    .eq("mesa_id", id)
    .eq("comercio_id", contexto.comercio.id)
    .eq("estado", "abierta")
    .maybeSingle();

  return (
    <div className="space-y-6">
      <Link
        href="/app/mesas"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Mesas
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">{mesa.nombre}</h1>
      <FormularioEditarMesa
        mesa={mesa}
        zonas={zonas ?? []}
        tieneCuentaAbierta={cuentaAbierta !== null}
      />
    </div>
  );
}
