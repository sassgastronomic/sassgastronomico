import { redirect } from "next/navigation";

import { cerrarSesion } from "@/lib/auth/actions";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Panel de administrador. `proxy.ts` ya redirige a /login a quien no tenga
 * sesión (chequeo optimista), pero acá se repite el chequeo y además se
 * valida `es_admin`: la autorización real siempre se confirma cerca de los
 * datos, no solo en el proxy.
 */
export default async function PaginaAdmin() {
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

  if (!perfil?.es_admin) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          Panel de administrador
        </h1>
        <p className="mb-6 text-sm text-neutral-500">{user.email}</p>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
