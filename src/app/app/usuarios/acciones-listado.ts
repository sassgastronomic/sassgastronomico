"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Desactiva un miembro desde el listado, sin pasar por la edición completa
 * — mismo mecanismo sin JS que `alternarSinStock` en
 * ../carta/productos/acciones-listado.ts.
 *
 * Solo desactiva, nunca reactiva: reactivar puede chocar con el límite de
 * usuarios (trigger `validar_limite_usuarios`), y ese error tiene que
 * mostrarse con feedback en un formulario (ver ./[id]/actions.ts), no
 * perderse en un no-op silencioso. Por eso el listado no ofrece un botón
 * para reactivar: hay que entrar a editar.
 */
export async function desactivarUsuario(
  id: string,
  _formData: FormData,
): Promise<void> {
  void _formData;

  // Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const { data: miembro, error: errorMiembro } = await supabase
    .from("miembros")
    .select("id, rol, perfil_id")
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id)
    .single();

  if (errorMiembro || !miembro) return;

  // El dueño no se puede desactivar a sí mismo. Su fila nunca muestra este
  // botón, pero esta Server Action es su propio endpoint: se valida igual.
  if (miembro.rol === "duenio" || miembro.perfil_id === contexto.usuario.id) {
    return;
  }

  const { error } = await supabase
    .from("miembros")
    .update({ activo: false })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (error) return;

  revalidatePath("/app/usuarios");
}
