import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase para Client Components (navegador).
 *
 * Usa siempre la clave anónima (`NEXT_PUBLIC_SUPABASE_ANON_KEY`): nunca la
 * `service_role`. Los permisos reales los define Postgres vía RLS
 * (ver `supabase/schema.sql`), no este cliente.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
