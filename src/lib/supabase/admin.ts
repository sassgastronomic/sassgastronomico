import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase con la `service_role key`: se salta RLS por completo.
 *
 * Usar solo para lo que la clave anónima no puede hacer de ninguna forma,
 * como `auth.admin.createUser` / `auth.admin.deleteUser` (la API de
 * administración de Auth no es alcanzable con la clave anónima, haya o no
 * sesión). Para leer o escribir tablas de negocio, usar siempre
 * `crearClienteServidor()` y dejar que decida RLS.
 *
 * `import "server-only"` hace que Next tire un error de build si este
 * archivo llega a importarse, aunque sea transitivamente, desde código de
 * cliente.
 *
 * No persiste sesión ni refresca tokens: no representa a ningún usuario, así
 * que no tiene sentido guardar nada en cookies.
 */
export function crearClienteAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
