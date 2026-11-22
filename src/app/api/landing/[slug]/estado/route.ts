import { validarSlug } from "@/lib/comercios/validacion";
import { SEGUNDOS_EN_CDN, type EstadoLocal } from "@/lib/landing/estado";
import { crearClientePublico } from "@/lib/supabase/publico";

/**
 * GET /api/landing/{slug}/estado → { tomandoPedidos, sinStock, leidoEn }
 *
 * Lo consulta la landing abierta para enterarse de que el local abrió (o
 * cerró) la caja y de qué se quedó sin stock: ver src/lib/landing/estado.ts.
 *
 * La respuesta es igual para todos (no depende de quién pregunta: no se
 * leen cookies y se habla con la base como `anon`), así que la guarda el
 * CDN: `s-maxage` para el CDN, `max-age=0` para que el navegador no se
 * quede con una vieja. Por eso el proxy no pasa por acá (ver src/proxy.ts):
 * una cookie de sesión en una respuesta cacheada le llegaría a cualquiera.
 *
 * Un comercio que no existe o no está activo responde como uno con la caja
 * cerrada y sin nada sin stock: la landing de esos ya muestra el aviso, y
 * así tampoco se confirma qué locales existen.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/landing/[slug]/estado">,
) {
  const { slug } = await params;
  const leidoEn = Date.now();
  if (validarSlug(slug) !== null) {
    return responder({ tomandoPedidos: false, sinStock: [], leidoEn });
  }

  const supabase = crearClientePublico();
  const { data, error } = await supabase.rpc("estado_landing", {
    p_slug: slug,
  });
  // Un error no se cachea: la landing reintenta en la próxima consulta.
  if (error) {
    return Response.json(
      { error: "No se pudo consultar el local" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return responder({
    tomandoPedidos: data?.tomando_pedidos ?? false,
    sinStock: data?.sin_stock ?? [],
    leidoEn,
  });
}

function responder(estado: EstadoLocal) {
  return Response.json(estado, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${SEGUNDOS_EN_CDN}`,
    },
  });
}
