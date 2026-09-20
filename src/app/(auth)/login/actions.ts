"use server";

import { redirect } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";
import { construirEmailInterno } from "@/lib/usuarios/email-interno";

export type EstadoLogin = {
  error?: string;
};

/**
 * Server Action de login: un identificador (email o nombre de usuario) +
 * contraseña.
 *
 * Supabase Auth siempre autentica por email. El dueño (y los admins)
 * escriben su email real; el personal sin email escribe su nombre de
 * usuario (ver docs/SCHEMA.md, "Identificación del personal") — acá se
 * distingue por la presencia de "@", que el formato de nombre de usuario
 * nunca tiene (`^[a-z0-9._]{3,30}$`), y se arma el mismo email interno con
 * el que se creó la cuenta.
 *
 * No hay alta pública: los usuarios los crea un admin desde el panel o el
 * dueño desde /app/usuarios. Después de autenticar, redirige según
 * `perfiles.es_admin`.
 */
export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const identificador = formData.get("identificador");
  const password = formData.get("password");

  if (
    typeof identificador !== "string" ||
    typeof password !== "string" ||
    !identificador ||
    !password
  ) {
    return { error: "Ingresá tu email o usuario, y tu contraseña." };
  }

  const valor = identificador.trim().toLowerCase();
  const email = valor.includes("@") ? valor : construirEmailInterno(valor);

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
