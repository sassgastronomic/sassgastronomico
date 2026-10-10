import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cache } from "react";

import { validarSlug } from "@/lib/comercios/validacion";
import { enlaceWhatsApp } from "@/lib/landing/whatsapp";
import { crearClientePublico } from "@/lib/supabase/publico";

import { AvisoPublico } from "./aviso-publico";
import { IconoChat } from "./iconos";
import { Landing, type CategoriaLanding } from "./landing";

/**
 * La carta del comercio, vía `carta_publica` — la misma fuente de verdad
 * que la vista previa del dueño y la carga del mozo: ya filtra la
 * disponibilidad efectiva (sector → categoría → producto). A diferencia
 * del mozo, acá los `sin_stock` se muestran (en gris): el cliente tiene
 * que entender por qué no puede pedirlo.
 *
 * `cache` para que generateMetadata y la página hagan una sola consulta.
 * `connection()`: el cliente público no lee cookies, así que sin esto Next
 * podría prerenderizar la carta y servirla vieja.
 */
const obtenerCarta = cache(async (slug: string) => {
  await connection();
  if (validarSlug(slug) !== null) return null;

  const supabase = crearClientePublico();
  const { data, error } = await supabase.rpc("carta_publica", {
    p_slug: slug,
  });
  // Un error de base no es "no existe": va al error boundary (con
  // "Reintentar"), no a la página de local no disponible.
  if (error) throw new Error(`carta_publica: ${error.message}`);
  return data;
});

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata({
  params,
}: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const carta = await obtenerCarta(slug);
  if (!carta) {
    return { title: "Local no disponible", robots: { index: false } };
  }
  const { nombre } = carta.comercio;
  if (carta.comercio.plan === "salon" || !carta.comercio.whatsapp) {
    return { title: nombre, robots: { index: false } };
  }
  return {
    title: `${nombre} · Pedí online`,
    description: `Mirá la carta de ${nombre} y hacé tu pedido para retirar o con envío.`,
  };
}

export default async function PaginaLanding({
  params,
}: PageProps<"/[slug]">) {
  const { slug } = await params;
  const carta = await obtenerCarta(slug);

  // Sin `notFound()` a propósito: con eso Next manda el HTML vacío y el
  // aviso lo dibuja recién el JavaScript (en un celular lento, pantalla en
  // blanco). Así llega armado; `robots: noindex` lo deja fuera de los
  // buscadores igual. `carta_publica` no distingue "no existe" de
  // "suspendido" (las dos dan null) y está bien: a quien abre el link no le
  // cambia nada, y la página tampoco confirma qué comercios existen.
  if (!carta) {
    return (
      <AvisoPublico titulo="Este local no está disponible">
        <p>
          Puede que el link esté mal escrito o que el local no esté tomando
          pedidos por acá en este momento.
        </p>
      </AvisoPublico>
    );
  }

  const { comercio } = carta;
  const contacto = comercio.whatsapp && (
    <a
      href={enlaceWhatsApp(comercio.whatsapp, "¡Hola! Tengo una consulta.")}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 active:bg-neutral-100"
    >
      <IconoChat className="h-5 w-5" />
      Escribirle por WhatsApp
    </a>
  );

  // Dos casos en los que el local no toma pedidos online, con las mismas
  // reglas que crear_pedido_landing:
  // - plan solo salón: la carta existe (es la del QR de mesa), pero no hay
  //   take away;
  // - sin WhatsApp cargado: el cliente no deja teléfono, el contacto es el
  //   chat que abre al confirmar; sin número no habría cómo hablarle.
  if (comercio.plan === "salon" || !comercio.whatsapp) {
    return (
      <AvisoPublico titulo={`${comercio.nombre} no toma pedidos online`}>
        <p>Acercate al local para hacer tu pedido.</p>
        {contacto}
      </AvisoPublico>
    );
  }

  const categorias: CategoriaLanding[] = carta.categorias
    .filter((categoria) => categoria.productos.length > 0)
    .map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      productos: categoria.productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        categoriaNombre: categoria.nombre,
        descripcion: producto.descripcion,
        precio: producto.precio,
        sinStock: producto.sin_stock,
        adicionales: producto.adicionales.map((adicional) => ({
          id: adicional.id,
          nombre: adicional.nombre,
          precioExtra: adicional.precio_extra,
        })),
      })),
    }));

  if (categorias.length === 0) {
    return (
      <AvisoPublico titulo={`${comercio.nombre} todavía no tiene su carta online`}>
        <p>Volvé a pasar en un rato.</p>
        {contacto}
      </AvisoPublico>
    );
  }

  return (
    <Landing
      slug={slug}
      comercio={{ nombre: comercio.nombre, whatsapp: comercio.whatsapp }}
      categorias={categorias}
    />
  );
}
