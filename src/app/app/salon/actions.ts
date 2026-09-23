"use server";

import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Abre una cuenta en una mesa libre, con el mozo actual como responsable.
 * Pensada para invocarse desde un <form action={abrirCuenta.bind(null,
 * mesaId)}> por tarjeta, mismo mecanismo sin JS que
 * ../carta/productos/acciones-listado.ts. No hay estado de error que
 * mostrar en el lugar: los problemas se comunican con un query param en el
 * redirect de vuelta (`/app/salon` los lee y muestra el aviso).
 */
export async function abrirCuenta(
  mesaId: string,
  _formData: FormData,
): Promise<void> {
  void _formData;

  // Autorización: dueño o mozo, con plan que incluya salón, sin depender
  // del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mozo") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // La mesa tiene que ser de este comercio y estar activa, con su zona
  // activa — en teoría ya lo garantiza la cascada de
  // actualizar_zona_con_mesas (ver supabase/migrations/), pero no se
  // confía en el id que llega del cliente: se revalida igual.
  const { data: mesa } = await supabase
    .from("mesas")
    .select("id, activo, zonas(activo)")
    .eq("id", mesaId)
    .eq("comercio_id", contexto.comercio.id)
    .maybeSingle();

  if (!mesa || !mesa.activo || !mesa.zonas?.activo) {
    redirect("/app/salon?error=mesa_no_disponible");
  }

  const { error } = await supabase.from("cuentas").insert({
    comercio_id: contexto.comercio.id,
    mesa_id: mesaId,
    mozo_id: contexto.usuario.id,
  });

  if (error) {
    // Índice único `cuenta_abierta_unica` (mesa_id, where estado =
    // 'abierta'): si dos mozos tocan la misma mesa casi a la vez, el
    // segundo en llegar pierde la carrera acá — 23505 = unique_violation.
    // No es un bug, es la regla de negocio haciendo su trabajo.
    if (error.code === "23505") {
      redirect("/app/salon?error=mesa_ocupada");
    }
    redirect("/app/salon?error=no_se_pudo_abrir");
  }

  redirect(`/app/salon/${mesaId}`);
}
