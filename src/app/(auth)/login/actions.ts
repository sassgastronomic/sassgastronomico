"use server";

import { redirect } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = {
  error?: string;
};

/**
 * Server Action de login: solo email + contraseña.
 *
 * No hay alta pública: los usuarios los crea un admin desde el panel
 * (ver docs/SCHEMA.md, sección "Roles"). Después de autenticar, redirige
 * según `perfiles.es_admin`.
 */
export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return { error: "Ingresá tu email y tu contraseña." };
  }

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    // Mensaje genérico: no confirmar si el email existe o no.
    return { error: "Email o contraseña incorrectos." };
  }

  // RLS (política `perfiles_propio`) permite que cada usuario lea su propio
  // perfil. No hace falta duplicar esa lógica acá, solo confiar en RLS.
  const { data: perfil, error: errorPerfil } = await supabase
    .from("perfiles")
    .select("es_admin")
    .eq("id", data.user.id)
    .single();

  if (errorPerfil || !perfil) {
    return { error: "No se pudo cargar tu perfil. Probá de nuevo." };
  }

  redirect(perfil.es_admin ? "/admin" : "/app");
}
