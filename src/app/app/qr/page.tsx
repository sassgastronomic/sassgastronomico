import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import { LARGO_CODIGO_BORRADOR } from "@/lib/qr-mesa/codigo";

import { buscarBorrador } from "./actions";

/**
 * El código del cliente, tipeado a mano.
 *
 * El camino normal es escanear el QR con la cámara del celular, que lleva
 * directo a /app/qr/[codigo]. Esta pantalla es para cuando eso no sale:
 * pantalla rota, poca luz, el cliente con el brillo al mínimo. La pantalla
 * del cliente ya le muestra el código en letras grandes justo para esto
 * ("si la cámara no lo lee, decile este código"), así que tiene que haber
 * dónde escribirlo.
 *
 * Se llega desde el menú, o desde el detalle de una mesa — y en ese caso
 * la mesa viaja en `?mesa=` y queda preelegida del otro lado.
 */
export default async function PaginaQr({
  searchParams,
}: PageProps<"/app/qr">) {
  // Autorización propia, sin depender del menú: dueño o mozo, con plan que
  // incluya salón. Mismo criterio que /app/salon.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio" && contexto.rol !== "mozo") {
    redirect("/app");
  }
  if (!planPermiteSalon(contexto.comercio.plan)) {
    redirect("/app");
  }

  const parametros = await searchParams;
  const mesaId = typeof parametros.mesa === "string" ? parametros.mesa : null;
  const errorFormato = parametros.error === "formato";

  return (
    <div className="max-w-md space-y-6 pb-8">
      <Link
        href={mesaId ? `/app/salon/${mesaId}` : "/app/salon"}
        className="inline-block text-base font-medium text-neutral-600"
      >
        ← {mesaId ? "Volver a la mesa" : "Mesas"}
      </Link>

      <div>
        <h1 className="text-2xl leading-tight font-bold text-neutral-900">
          Escribir el código del cliente
        </h1>
        <p className="mt-2 text-base text-neutral-600">
          Lo tiene en su pantalla, abajo del QR. Son{" "}
          {LARGO_CODIGO_BORRADOR} letras y números. Si la cámara lo lee, no
          hace falta escribir nada: el QR te trae directo.
        </p>
      </div>

      <form
        action={buscarBorrador.bind(null, mesaId)}
        className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <div>
          <label
            htmlFor="codigo"
            className="block text-sm font-semibold text-neutral-700"
          >
            Código
          </label>
          <input
            id="codigo"
            name="codigo"
            type="text"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={LARGO_CODIGO_BORRADOR}
            placeholder="A1BCD2EF"
            aria-describedby={errorFormato ? "error-codigo" : undefined}
            // `uppercase` y `tracking`: se lee de un tirón para
            // compararlo con la pantalla del cliente. El campo acepta
            // minúsculas igual — el servidor las pasa a mayúscula.
            className="mt-2 w-full rounded-xl border-2 border-neutral-300 px-4 py-4 text-center text-3xl font-black tracking-[0.2em] uppercase tabular-nums focus:border-neutral-900 focus:outline-none"
          />
        </div>

        {errorFormato && (
          <p
            id="error-codigo"
            role="alert"
            className="rounded-xl bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900"
          >
            Ese código no tiene el formato correcto. Son{" "}
            {LARGO_CODIGO_BORRADOR} letras y números, sin las letras I, L, O
            ni U.
          </p>
        )}

        <button
          type="submit"
          className="min-h-16 w-full rounded-2xl bg-neutral-900 px-5 text-xl font-bold text-white active:bg-neutral-700"
        >
          Ver el pedido
        </button>
      </form>
    </div>
  );
}
