import { redirect } from "next/navigation";

import { cerrarSesion } from "@/lib/auth/actions";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * App del comercio (dueño, mostrador, mozo, cocina, barra). `proxy.ts` ya
 * redirige a /login a quien no tenga sesión (chequeo optimista); acá se
 * repite el chequeo cerca de los datos, como recomienda la guía de
 * autenticación de Next.js.
 */
export default async function PaginaApp() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          App del comercio
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
