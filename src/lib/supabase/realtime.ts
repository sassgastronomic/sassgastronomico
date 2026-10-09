import type { RealtimeChannel } from "@supabase/supabase-js";

import { crearClienteNavegador } from "@/lib/supabase/client";

type ClienteNavegador = ReturnType<typeof crearClienteNavegador>;

/**
 * Única forma de abrir un canal de Realtime en la app: siempre por acá,
 * nunca con `supabase.channel(...).subscribe()` directo en un componente.
 *
 * Por qué: el join del canal no espera a que el cliente termine de leer la
 * sesión. Si sale antes, el servidor registra la suscripción como `anon`,
 * RLS no le deja ver ninguna fila y no llega ningún evento — aunque el
 * canal diga SUBSCRIBED. Si el token llega con el join a mitad de camino,
 * la librería tampoco se lo reenvía. Esta función pide el token primero y
 * recién después arma el canal (ver docs/ARQUITECTURA.md, "Trampa
 * conocida: Realtime se suscribe como anónimo").
 *
 * Pensada para usarse dentro de un useEffect: devuelve la función de
 * limpieza. Si el efecto se limpia antes de que llegue el token (React
 * monta y desmonta dos veces en desarrollo), el canal nunca se abre.
 *
 * `armarCanal` recibe el cliente y tiene que devolver el canal ya con sus
 * `.on(...)` y su `.subscribe(...)`.
 */
export function suscribirseConSesion(
  armarCanal: (supabase: ClienteNavegador) => RealtimeChannel,
): () => void {
  const supabase = crearClienteNavegador();
  let cancelado = false;
  let canal: RealtimeChannel | null = null;

  void supabase.realtime.setAuth().then(() => {
    if (cancelado) return;
    canal = armarCanal(supabase);
  });

  return () => {
    cancelado = true;
    if (canal) void supabase.removeChannel(canal);
  };
}
