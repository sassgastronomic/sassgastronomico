/**
 * "Hace cuánto" en español, para la antigüedad de una cuenta abierta.
 * Se calcula en el servidor al renderizar la página (sin reloj en vivo en
 * el cliente): un mozo que la deja abierta en la pantalla un rato largo ve
 * el valor del último refresco, no uno que avanza solo — no hace falta más
 * para esta pantalla.
 */
export function formatearTiempoAbierta(abiertaEn: string): string {
  const minutos = Math.max(
    0,
    Math.round((Date.now() - new Date(abiertaEn).getTime()) / 60000),
  );

  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
