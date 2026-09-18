"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  esEstadoValido,
  esPlanValido,
  validarLimiteUsuarios,
  validarNombreComercio,
} from "@/lib/comercios/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoEditarComercio = "nombre" | "plan" | "estado" | "limite_usuarios";

export type EstadoEditarComercio = {
  error?: string;
  // Qué campo causó el error, para marcarlo en rojo y llevarle el foco.
  campo?: CampoEditarComercio;
  // Repuebla el formulario si la Server Action devuelve un error: un
  // `<form action={...}>` con Server Action resetea los inputs no
  // controlados a su valor original después de cada envío, así que sin esto
  // se pierden los cambios que el admin todavía no guardó.
  valores?: {
    nombre: string;
    plan: string;
    estado: string;
    limiteUsuarios: string;
  };
};

/**
 * Actualiza nombre, plan, límite de usuarios y estado de un comercio. El
 * slug no se toca acá: cambiarlo rompería los links ya compartidos
 * (`/{slug}`, QR de mesa, etc.), así que ni siquiera se lee del formulario.
 */
export async function actualizarComercio(
  _estadoPrevio: EstadoEditarComercio,
  formData: FormData,
): Promise<EstadoEditarComercio> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const plan = String(formData.get("plan") ?? "");
  const estadoComercio = String(formData.get("estado") ?? "");
  const limiteUsuariosTexto = String(formData.get("limite_usuarios") ?? "");

  if (!id) {
    return { error: "Falta el comercio a editar." };
  }

  const valores: NonNullable<EstadoEditarComercio["valores"]> = {
    nombre,
    plan,
    estado: estadoComercio,
    limiteUsuarios: limiteUsuariosTexto,
  };

  const errorNombre = validarNombreComercio(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  if (!esPlanValido(plan)) {
    return { error: "Elegí un plan válido.", campo: "plan", valores };
  }

  if (!esEstadoValido(estadoComercio)) {
    return { error: "Elegí un estado válido.", campo: "estado", valores };
  }

  const errorLimite = validarLimiteUsuarios(limiteUsuariosTexto);
  if (errorLimite) {
    return { error: errorLimite, campo: "limite_usuarios", valores };
  }

  const limiteUsuarios = Number(limiteUsuariosTexto);

  // Confirmar que quien invoca esto es admin, sin depender solo del layout
  // de /admin (esta Server Action es su propio endpoint).
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("es_admin")
    .eq("id", user.id)
    .single();

  if (!perfil?.es_admin) {
    redirect("/app");
  }

  // RLS: `comercios_admin` exige `es_admin()`.
  const { error } = await supabase
    .from("comercios")
    .update({
      nombre,
      plan,
      estado: estadoComercio,
      limite_usuarios: limiteUsuarios,
    })
    .eq("id", id);

  if (error) {
    // El trigger `validar_cambio_plan` (supabase/schema.sql) corre "before
    // update of plan" y es el único que puede rechazar este update (mesas
    // abiertas o pedidos por confirmar); por eso el error siempre es del
    // campo `plan`. Se muestra el mensaje del error tal como llega, no uno
    // genérico: está escrito para leerse tal cual.
    return { error: error.message, campo: "plan", valores };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/comercios/${id}`);
  redirect("/admin");
}
