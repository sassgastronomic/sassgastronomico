/**
 * Supabase Auth exige un email por cuenta, pero el personal sin email real
 * (mostrador/mozo/sector, ver docs/SCHEMA.md "Identificación del personal")
 * se identifica con un nombre de usuario. Se le arma un email interno a
 * partir de ese nombre de usuario, en un dominio que no resuelve a nada
 * real — nunca se muestra en la interfaz, es un detalle de implementación
 * para satisfacer a Auth, no una credencial que use nadie.
 *
 * Dominio en una sola constante: si alguna vez hay que cambiarlo, es acá y
 * en ningún otro lado.
 */
export const DOMINIO_EMAIL_INTERNO = "usuarios.local";

export function construirEmailInterno(usuario: string): string {
  return `${usuario}@${DOMINIO_EMAIL_INTERNO}`;
}
