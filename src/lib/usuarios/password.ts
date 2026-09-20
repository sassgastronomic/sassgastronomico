import "server-only";

import { randomBytes } from "node:crypto";

// Sin caracteres ambiguos (0/O, 1/l/I): más fácil de transcribir a mano si
// hace falta. 14 caracteres de este alfabeto de 55 dan ~80 bits de entropía,
// bien por encima del mínimo de 8 que pide validarPasswordUsuario.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const LONGITUD = 14;
// 256 no es múltiplo de ALFABETO.length (55): tomar `byte % 55` directo
// sesga levemente a favor de los primeros caracteres del alfabeto (los
// residuos 0-35 salen 5 veces por cada 256 bytes en vez de 4). Se descarta
// el byte y se vuelve a sortear cuando cae en el resto que no reparte
// parejo, en vez de aceptar el sesgo.
const LIMITE_SIN_SESGO = 256 - (256 % ALFABETO.length);

/**
 * Contraseña temporal para un usuario nuevo o para un reseteo: se genera en
 * el servidor, se usa una sola vez para crear/actualizar el usuario en
 * Auth, y se le muestra al dueño una única vez (no se guarda en ningún
 * lado — ni en la base ni en el estado del formulario más allá de esa
 * respuesta).
 */
export function generarPasswordTemporal(): string {
  let resultado = "";
  while (resultado.length < LONGITUD) {
    const byte = randomBytes(1)[0];
    if (byte >= LIMITE_SIN_SESGO) continue;
    resultado += ALFABETO[byte % ALFABETO.length];
  }
  return resultado;
}
