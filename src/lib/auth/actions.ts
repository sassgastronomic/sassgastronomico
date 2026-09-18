"use server";

import { redirect } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Server Action de logout, compartida por /admin y /app.
 * `redirect()` va fuera de cualquier try/catch: lanza una excepción interna
 * (`NEXT_REDIRECT`) que Next.js necesita que se propague sin ser atrapada.
 */
export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
