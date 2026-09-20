import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Usa la clave anónima (nunca la `service_role`) y delega los permisos a las
 * políticas RLS de `supabase/migrations/`. Lee y escribe las cookies de sesión
 * con la API asíncrona `cookies()` de Next.js 15+.
 *
 * Hay que crear un cliente nuevo en cada request (no compartir uno global).
 */
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `set` fue llamado desde un Server Component (no desde una
            // Server Action ni un Route Handler), donde no se pueden escribir
            // cookies. Se puede ignorar porque `proxy.ts` ya se encarga de
            // refrescar la sesión en cada request.
          }
        },
      },
    },
  );
}
