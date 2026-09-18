import Link from "next/link";
import { redirect } from "next/navigation";

import { cerrarSesion } from "@/lib/auth/actions";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Layout del panel de administrador: valida sesión + rol admin una sola vez
 * y muestra el header (email + cerrar sesión) para todas las páginas bajo
 * /admin, en vez de repetirlo en cada page.tsx.
 *
 * Ojo: Next.js advierte que un layout no se vuelve a ejecutar en cada
 * navegación del lado del cliente (Partial Rendering), así que este chequeo
 * cubre cada carga de página pero no es la única barrera. La autorización
 * real queda en la policy `comercios_admin` de supabase/schema.sql, que
 * exige `es_admin()` en la base: aunque este guard tuviera un bug, RLS no
 * deja pasar datos de comercios a quien no sea admin.
 */
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
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
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Panel de administrador
            </p>
            <p className="text-xs text-neutral-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/comercios/nuevo"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Crear comercio
            </Link>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
