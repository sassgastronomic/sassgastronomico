"use server";

import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteSalon } from "@/lib/mesas/validacion";
import {
  esCodigoBorrador,
  normalizarCodigoBorrador,
} from "@/lib/qr-mesa/codigo";

/**
 * Lleva al mozo a la pantalla del código que tipeó a mano.
 *
 * No lee nada de la base: solo valida el formato y navega. Quién puede ver
 * ese código lo decide `leer_borrador_qr` cuando la pantalla de destino
 * pregunta — un código inventado llega ahí igual y recibe "no existe", que
 * es la respuesta correcta.
 *
 * Es un `<form action={...}>` y no un `onSubmit`: así el campo funciona sin
 * JavaScript, que en el celular de un mozo con señal mala no es un detalle.
 */
export async function buscarBorrador(
  mesaId: string | null,
  formData: FormData,
): Promise<void> {
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

  const codigo = normalizarCodigoBorrador(String(formData.get("codigo") ?? ""));

  const parametros = new URLSearchParams();
  if (mesaId) parametros.set("mesa", mesaId);
  const sufijo = parametros.size > 0 ? `?${parametros.toString()}` : "";

  if (!esCodigoBorrador(codigo)) {
    parametros.set("error", "formato");
    redirect(`/app/qr?${parametros.toString()}`);
  }

  redirect(`/app/qr/${codigo}${sufijo}`);
}
