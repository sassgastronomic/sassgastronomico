import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerCajaAbierta } from "@/lib/caja/caja";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { formatearPrecio } from "@/lib/landing/precios";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import {
  esCodigoBorrador,
  normalizarCodigoBorrador,
} from "@/lib/qr-mesa/codigo";
import { obtenerZonasConMesas } from "@/lib/salon/mesas";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { BorradorQrLeido } from "@/types/database";

import { Confirmacion } from "./confirmacion";

/**
 * La pantalla del mozo: cierra el circuito del pedido por QR de mesa.
 *
 * El cliente armó su pedido en /{slug}/mesa y su celular le muestra un QR.
 * Ese QR es un link a esta dirección (`linkEscaneoMozo`, ver
 * src/lib/landing/link.ts), así que el mozo lo escanea con la cámara
 * nativa de su celular y cae acá, en la app donde ya está logueado. No hay
 * lector de QR dentro de la app a propósito: la cámara del sistema es más
 * rápida y no hay que pedirle permisos a nada.
 *
 * Nada de lo que ve acá está cargado todavía: el borrador no es un pedido.
 * El pedido nace cuando el mozo elige la mesa y confirma.
 *
 * Toda la plata y la disponibilidad salen de `leer_borrador_qr`, no del
 * código del QR: el QR solo trae ocho caracteres.
 */

// ---------------------------------------------------------------------
// Piezas compartidas por todos los estados de la pantalla
// ---------------------------------------------------------------------

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 pb-8">
      <Link
        href="/app/salon"
        className="inline-block text-base font-medium text-neutral-600"
      >
        ← Mesas
      </Link>
      {children}
    </div>
  );
}

const TONO = {
  neutral: "border-neutral-300 bg-white text-neutral-900",
  ambar: "border-amber-300 bg-amber-50 text-amber-950",
  rojo: "border-red-300 bg-red-50 text-red-950",
} as const;

/**
 * Un estado que no se puede cargar, explicado en una tarjeta grande. Nunca
 * un error técnico: el mozo tiene al cliente mirándolo, necesita saber qué
 * decirle.
 */
function Aviso({
  tono,
  titulo,
  children,
}: {
  tono: keyof typeof TONO;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`space-y-3 rounded-2xl border-2 p-6 ${TONO[tono]}`}
    >
      <h1 className="text-2xl leading-tight font-bold text-balance">
        {titulo}
      </h1>
      {children}
    </div>
  );
}

/**
 * El pedido del cliente, línea por línea. Se muestra en todos los estados.
 *
 * `avisarFaltas` se apaga cuando el borrador ya se cargó: lo que se ve ahí
 * es lo que el cliente pidió, pero la ronda ya entró con los precios y el
 * stock de ese momento. Marcar ahora "ya no está disponible" sobre algo que
 * la cocina ya está haciendo sería mentirle al mozo. Con el código vencido,
 * en cambio, sí conviene avisar: el cliente lo va a tener que armar de
 * nuevo, y mejor que se entere antes de qué falta.
 */
function DetalleBorrador({
  borrador,
  avisarFaltas = true,
}: {
  borrador: BorradorQrLeido;
  avisarFaltas?: boolean;
}) {
  const unidades = borrador.items.reduce(
    (suma, item) => suma + item.cantidad,
    0,
  );

  return (
    <section aria-labelledby="titulo-detalle" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-detalle" className="text-lg font-bold text-neutral-900">
          Lo que pidió
        </h2>
        <span className="text-sm text-neutral-500">
          {unidades} {unidades === 1 ? "unidad" : "unidades"} · código{" "}
          <span className="font-bold tracking-widest tabular-nums">
            {borrador.codigo}
          </span>
        </span>
      </div>

      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {borrador.items.map((item, indice) => (
          <li
            // El borrador no tiene ids de línea, y el orden no cambia nunca
            // (es el que armó el cliente): el índice alcanza como clave.
            key={indice}
            className={`flex items-start justify-between gap-4 px-4 py-3 ${
              avisarFaltas && !item.disponible ? "bg-red-50" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="text-lg font-bold text-neutral-900">
                {item.cantidad}×{" "}
                {item.nombre ?? "Un producto que ya no está en la carta"}
              </p>
              {item.categoria_nombre && (
                <p className="text-sm text-neutral-500">
                  {item.categoria_nombre}
                </p>
              )}
              {item.adicionales.length > 0 && (
                <p className="text-sm text-neutral-700">
                  Con: {item.adicionales.map((a) => a.nombre).join(", ")}
                </p>
              )}
              {item.nota && (
                <p className="text-base font-semibold text-amber-800">
                  &quot;{item.nota}&quot;
                </p>
              )}
              {avisarFaltas && !item.disponible && (
                <p className="mt-1 text-sm font-bold text-red-800">
                  Ya no está disponible
                </p>
              )}
              {/* Los agregados caídos no bloquean nada: la base los filtra
                  y carga la línea sin ellos. Se avisa para que el mozo se
                  lo diga al cliente antes y no después. */}
              {avisarFaltas && item.adicionales_caidos > 0 && (
                <p className="mt-1 text-sm font-semibold text-amber-800">
                  {item.adicionales_caidos === 1
                    ? "Un agregado que eligió ya no está: va sin eso"
                    : `${item.adicionales_caidos} agregados que eligió ya no están: va sin eso`}
                </p>
              )}
            </div>
            <p className="shrink-0 text-base font-semibold tabular-nums">
              {formatearPrecio(item.subtotal)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between gap-4 px-1">
        <span className="text-lg font-bold text-neutral-900">Total</span>
        <span className="text-2xl font-black text-neutral-900 tabular-nums">
          {formatearPrecio(borrador.total)}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// La página
// ---------------------------------------------------------------------

export default async function PaginaCodigoQr({
  params,
  searchParams,
}: PageProps<"/app/qr/[codigo]">) {
  const [{ codigo }, parametros] = await Promise.all([params, searchParams]);

  // Autorización propia, sin depender del menú: dueño o mozo, con plan que
  // incluya salón. Mismo criterio que /app/salon, y repetido en la acción
  // (una página no es una frontera de seguridad: la acción se puede llamar
  // sin pasar por acá).
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

  const normalizado = normalizarCodigoBorrador(codigo);

  // El formato se chequea antes de ir a la base: un link mal copiado no
  // tiene por qué costar una consulta.
  if (!esCodigoBorrador(normalizado)) {
    return (
      <Marco>
        <Aviso tono="ambar" titulo="Ese código no es válido">
          <p className="text-base">
            Un código del cliente tiene 8 letras y números. Si lo estás
            tipeando, fijate de copiarlo igual que en su pantalla.
          </p>
          <Link
            href="/app/qr"
            className="inline-block rounded-xl bg-amber-900 px-5 py-3 text-base font-bold text-white"
          >
            Escribir el código de nuevo
          </Link>
        </Aviso>
      </Marco>
    );
  }

  const supabase = await crearClienteServidor();
  const { data: borrador } = await supabase.rpc("leer_borrador_qr", {
    p_codigo: normalizado,
  });

  // `leer_borrador_qr` devuelve null si el código no existe o si quien
  // pregunta no atiende en ese comercio. La comparación de `comercio_id`
  // es para el caso raro del usuario que es miembro de más de un comercio:
  // `tiene_rol` mira cualquier membresía activa, pero la app entra a uno
  // solo (ver src/lib/comercio/contexto.ts), y la lista de mesas y la
  // conversión son de ese.
  if (!borrador || borrador.comercio_id !== contexto.comercio.id) {
    return (
      <Marco>
        <Aviso tono="ambar" titulo="Ese código no existe o ya se borró">
          <p className="text-base">
            Puede que el cliente lo haya armado hace mucho —los códigos
            valen 30 minutos— o que esté mostrando el de otro local. Pedile
            que lo arme de nuevo desde el QR de la mesa.
          </p>
          <Link
            href="/app/salon"
            className="inline-block rounded-xl bg-amber-900 px-5 py-3 text-base font-bold text-white"
          >
            Cargarlo a mano en una mesa
          </Link>
        </Aviso>
      </Marco>
    );
  }

  // Ya se cargó: el caso del segundo escaneo del mismo QR (el mozo dudó, o
  // escanearon dos). No es un error, es la respuesta a "¿entró?".
  if (borrador.estado === "usado") {
    const cargado = borrador.cargado;
    return (
      <Marco>
        <Aviso tono="neutral" titulo="Este pedido ya está cargado">
          {cargado ? (
            <p className="text-lg">
              Entró como la{" "}
              <strong className="font-bold">
                ronda #{cargado.pedido_numero ?? "—"}
              </strong>
              {cargado.mesa_nombre && (
                <>
                  {" "}
                  en <strong className="font-bold">{cargado.mesa_nombre}</strong>
                </>
              )}
              . No hace falta cargarlo otra vez.
            </p>
          ) : (
            <p className="text-lg">
              Ya se usó para cargar una ronda. No hace falta cargarlo otra
              vez.
            </p>
          )}
          {cargado?.mesa_id && (
            <Link
              href={`/app/salon/${cargado.mesa_id}`}
              className="inline-block rounded-xl bg-neutral-900 px-5 py-3 text-base font-bold text-white"
            >
              Ver {cargado.mesa_nombre ?? "la mesa"}
            </Link>
          )}
        </Aviso>
        <DetalleBorrador borrador={borrador} avisarFaltas={false} />
      </Marco>
    );
  }

  if (borrador.estado === "vencido") {
    return (
      <Marco>
        <Aviso tono="ambar" titulo="Este código venció">
          <p className="text-base">
            Un código vale 30 minutos desde que el cliente lo arma. Pedile
            que lo arme de nuevo con el QR de la mesa: en su pantalla ya le
            aparece el botón para hacerlo, con el pedido guardado.
          </p>
          <Link
            href="/app/salon"
            className="inline-block rounded-xl bg-amber-900 px-5 py-3 text-base font-bold text-white"
          >
            Cargarlo a mano en una mesa
          </Link>
        </Aviso>
        <DetalleBorrador borrador={borrador} />
      </Marco>
    );
  }

  // Vigente: ahora sí hacen falta las mesas y el estado de la caja.
  const [zonas, caja] = await Promise.all([
    obtenerZonasConMesas(contexto.comercio.id),
    obtenerCajaAbierta(contexto.comercio.id),
  ]);
  const cajaAbierta = caja !== null;

  // `?mesa=` (viene del detalle de una mesa, ver /app/salon/[id]): se
  // valida contra la lista, nunca se confía en el parámetro.
  const mesaPedida =
    typeof parametros.mesa === "string" ? parametros.mesa : null;
  const mesaInicial =
    zonas.flatMap((zona) => zona.mesas).some((mesa) => mesa.id === mesaPedida)
      ? mesaPedida
      : null;

  return (
    <Marco>
      <div>
        <h1 className="text-2xl leading-tight font-bold text-neutral-900">
          Pedido del cliente
        </h1>
        <p className="mt-1 text-base text-neutral-600">
          Todavía no entró a la cocina. Elegí la mesa y confirmá.
        </p>
      </div>

      {/* El interruptor apagado NO bloquea: apagarlo corta los borradores
          nuevos, no el que un cliente ya tiene en la mano. Mismo criterio
          que `convertir_borrador_qr`, que tampoco lo revalida. */}
      {!contexto.comercio.qr_mesa_activo && (
        <p className="rounded-2xl border-2 border-neutral-300 bg-white px-4 py-4 text-base text-neutral-700">
          <strong className="font-bold">
            El pedido por QR está apagado ahora.
          </strong>{" "}
          Este código se armó antes de que lo apagaran, así que se puede
          cargar igual.
        </p>
      )}

      <DetalleBorrador borrador={borrador} />

      {borrador.hay_no_disponibles ? (
        // Todo o nada: `crear_ronda_en_cuenta` corta con la primera línea
        // que no esté disponible, así que no se ofrece un botón que no
        // puede funcionar.
        <Aviso tono="rojo" titulo="Así no se puede cargar">
          <p className="text-base">
            Lo que está marcado en rojo ya no se vende. Decile al cliente
            que arme el pedido de nuevo sin eso, o cargáselo a mano con lo
            que sí hay.
          </p>
          <Link
            href="/app/salon"
            className="inline-block rounded-xl bg-red-900 px-5 py-3 text-base font-bold text-white"
          >
            Cargarlo a mano en una mesa
          </Link>
        </Aviso>
      ) : !cajaAbierta ? (
        // Sin caja no entra ningún pedido: lo rechaza el trigger
        // `pedido_numero` en la base. Se avisa en vez de dejar tocar un
        // botón que va a fallar.
        <Aviso tono="ambar" titulo="La caja no está abierta">
          <p className="text-base">
            Sin la caja abierta no entra ningún pedido. Pedile al mostrador
            que la abra y volvé a escanear el código del cliente: sigue
            valiendo.
          </p>
        </Aviso>
      ) : zonas.length === 0 ? (
        <Aviso tono="ambar" titulo="No hay mesas donde cargarlo">
          <p className="text-base">
            Este local todavía no tiene mesas activas. Pedile al dueño que
            las cargue en &quot;Configurar mesas&quot;.
          </p>
        </Aviso>
      ) : (
        <Confirmacion
          codigo={borrador.codigo}
          zonas={zonas}
          mesaInicial={mesaInicial}
        />
      )}
    </Marco>
  );
}
