import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Cliente de Supabase para las pantallas públicas (landing `/{slug}` y
 * seguimiento de pedidos), del lado del servidor.
 *
 * A diferencia de `crearClienteServidor()`, no lee las cookies: siempre
 * habla con la base como `anon`, aunque quien abra la landing sea el
 * dueño con su sesión iniciada. Así lo que se prueba es exactamente lo que
 * ve un cliente, y una pantalla pública nunca puede apoyarse sin querer en
 * los permisos de alguien logueado. Lo único que `anon` puede hacer son
 * las funciones públicas (`carta_publica`, `crear_pedido_landing`,
 * `seguimiento_pedido`): ninguna tabla le deja leer nada (RLS).
 *
 * Sin cookies, Next no se entera de que la página depende del request:
 * las páginas que lo usan llaman a `connection()` para no quedar
 * prerenderizadas con datos viejos.
 */
export function crearClientePublico() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
