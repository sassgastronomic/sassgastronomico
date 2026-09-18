import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

// Rutas que requieren estar autenticado.
const RUTAS_PROTEGIDAS = ["/admin", "/app"];

/**
 * Refresca la sesión de Supabase en cada request y protege /admin y /app.
 *
 * Nota: en Next.js 16 el archivo `middleware.ts` quedó deprecado y fue
 * renombrado a `proxy.ts` (la función también pasa a llamarse `proxy`). La
 * funcionalidad es la misma; ver node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/proxy.md.
 *
 * Esto es un chequeo optimista: solo mira si hay un usuario autenticado y
 * redirige. La autorización real (qué comercio, qué rol) queda en manos de
 * RLS en cada consulta a Supabase.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const esRutaProtegida = RUTAS_PROTEGIDAS.some((ruta) =>
    request.nextUrl.pathname.startsWith(ruta),
  );

  let user: { id: string } | null = null;
  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // getUser() valida el token contra el servidor de Auth de Supabase.
    // No usar getSession() acá: confiaría en la cookie sin verificarla.
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // Si Supabase no responde, no tiene sentido tumbar TODA la app (el
    // matcher cubre casi cualquier ruta). Dejamos pasar el request: es
    // un chequeo optimista, la autorización real está en cada Server
    // Component (que vuelve a llamar a Supabase) y en RLS.
    console.error("[proxy] no se pudo refrescar la sesión:", error);
    return response;
  }

  if (!user && esRutaProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redireccion = NextResponse.redirect(url);

    // `response` puede traer cookies que Supabase acaba de reescribir en
    // `setAll` (p. ej. limpiar tokens inválidos tras un refresh fallido).
    // Si no las copiamos al nuevo NextResponse.redirect(), esas cookies
    // nunca llegan al navegador: la cookie vieja queda pegada y el proxy
    // vuelve a intentar (y fallar) el refresh en cada request siguiente.
    //
    // Nota: la guía oficial (supabase.com/docs/guides/auth/server-side/nextjs)
    // sugiere copiarlas con `nuevaResponse.cookies.setAll(response.cookies.getAll())`,
    // pero `ResponseCookies` (next/dist/compiled/@edge-runtime/cookies) no
    // expone `setAll`, solo `set` por cookie — por eso el forEach de abajo.
    response.cookies.getAll().forEach((cookie) => {
      redireccion.cookies.set(cookie);
    });

    return redireccion;
  }

  return response;
}

export const config = {
  matcher: [
    // Corre en todo menos assets estáticos e imágenes optimizadas.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
