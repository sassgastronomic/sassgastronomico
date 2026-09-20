import { redirect } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Home ("/"). No tiene pantalla propia: solo decide a dónde mandar según
 * quién sos, mismo criterio que usa `iniciarSesion()`
 * (src/app/(auth)/login/actions.ts) después de loguear.
 */
export default async function Home() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS (política `perfiles_propio`) permite que cada usuario lea su propio
  // perfil.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("es_admin")
    .eq("id", user.id)
    .single();

  redirect(perfil?.es_admin ? "/admin" : "/app");
}
