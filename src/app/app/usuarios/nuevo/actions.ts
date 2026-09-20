"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { construirEmailInterno } from "@/lib/usuarios/email-interno";
import { planPermiteRol } from "@/lib/miembros/plan";
import { generarPasswordTemporal } from "@/lib/usuarios/password";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  esRolAsignable,
  validarNombreUsuario,
  validarPasswordManual,
  validarSectoresAsignados,
  validarUsuario,
} from "@/lib/usuarios/validacion";

export type CampoNuevoUsuario =
  | "nombre"
  | "usuario"
  | "password"
  | "rol"
  | "sectores";

export type EstadoNuevoUsuario = {
  error?: string;
  campo?: CampoNuevoUsuario;
  // Alternativa libre cuando el error es "usuario ya tomado" — el form la
  // ofrece como acceso directo para no obligar a inventar una a mano.
  sugerenciaUsuario?: string;
  valores?: {
    nombre: string;
    usuario: string;
    modoPassword: string;
    rol: string;
    sectorIds: string[];
  };
  // Presente solo si la creación salió bien Y la contraseña fue generada
  // por el sistema: hay que mostrarla una vez antes de volver al listado,
  // así que en ese caso esta Server Action no redirige sola.
  creado?: { usuario: string; passwordGenerada: string };
};

/**
 * Busca un nombre de usuario libre a partir de uno ya tomado, agregándole un
 * sufijo numérico (juan.bardemo -> juan.bardemo2 -> ...). `base` ya pasó
 * `validarUsuario`, así que cualquier sufijo que se le agregue sigue
 * cumpliendo el formato. `usuario_disponible` es security definer porque
 * `perfiles` acota lecturas por comercio (ver supabase/schema.sql): sin
 * eso, esta consulta podría dar "libre" algo que ya usa otro comercio.
 */
async function sugerirUsuarioAlternativo(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  base: string,
): Promise<string | null> {
  for (let sufijo = 2; sufijo <= 20; sufijo++) {
    const texto = String(sufijo);
    const candidato = `${base.slice(0, 30 - texto.length)}${texto}`;
    const { data: libre, error } = await supabase.rpc("usuario_disponible", {
      p_usuario: candidato,
    });

    if (error) {
      // No debería pasar: acá siempre se llega con `contexto.rol ===
      // "duenio"` ya confirmado, el único caller que `usuario_disponible`
      // autoriza. Si igual pasa, no tiene sentido seguir probando sufijos
      // (va a fallar igual con cualquiera) — se corta, se deja registrado y
      // se devuelve sin sugerencia en vez de agotar los 20 intentos.
      console.error(
        `[sugerirUsuarioAlternativo] usuario_disponible falló para "${candidato}": ${error.message}`,
      );
      return null;
    }

    if (libre) return candidato;
  }
  return null;
}

/**
 * Crea un miembro del personal: usuario en Auth (con un email interno
 * derivado del nombre de usuario, ver src/lib/usuarios/email-interno.ts),
 * fila en `miembros` y, si el rol es `sector`, las filas en
 * `miembro_sectores`.
 *
 * Mismo patrón de reversión que `crearComercio`
 * (src/app/admin/comercios/nuevo/actions.ts): son escrituras en dos
 * sistemas (Postgres + GoTrue) sin una transacción real que las cubra a
 * todas. Acá el único paso "externo" es crear el usuario en Auth, y todo lo
 * demás en Postgres cuelga de ese usuario por FK con `on delete cascade`
 * (perfiles -> miembros -> miembro_sectores, ver supabase/schema.sql), así
 * que revertir siempre es lo mismo: borrar el usuario de Auth deshace todo
 * lo que ya se había insertado.
 */
export async function crearUsuario(
  _estadoPrevio: EstadoNuevoUsuario,
  formData: FormData,
): Promise<EstadoNuevoUsuario> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const usuario = String(formData.get("usuario") ?? "")
    .trim()
    .toLowerCase();
  const modoPassword = String(formData.get("modo_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const rol = String(formData.get("rol") ?? "");
  const sectorIds = [...new Set(formData.getAll("sector_id").map(String))];

  const valores: NonNullable<EstadoNuevoUsuario["valores"]> = {
    nombre,
    usuario,
    modoPassword,
    rol,
    sectorIds,
  };

  // 1. Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo — en
  // particular, `duenio` nunca es un rol válido acá, le llegue o no el
  // valor (el <select> del form ni siquiera lo ofrece como opción).
  const errorNombre = validarNombreUsuario(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  const errorUsuario = validarUsuario(usuario);
  if (errorUsuario) return { error: errorUsuario, campo: "usuario", valores };

  if (modoPassword !== "manual" && modoPassword !== "generar") {
    return { error: "Elegí cómo definir la contraseña.", campo: "password", valores };
  }

  if (modoPassword === "manual") {
    const errorPassword = validarPasswordManual(password);
    if (errorPassword) {
      return { error: errorPassword, campo: "password", valores };
    }
  }

  if (!esRolAsignable(rol)) {
    return { error: "Elegí un rol válido.", campo: "rol", valores };
  }

  const errorSectores = validarSectoresAsignados(rol, sectorIds);
  if (errorSectores) {
    return { error: errorSectores, campo: "sectores", valores };
  }

  // 2. Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  // 3. El plan decide si `mozo` es un rol válido hoy (política
  // `plan_permite_rol` en supabase/schema.sql; espejo en
  // src/lib/miembros/plan.ts).
  if (!planPermiteRol(contexto.comercio.plan, rol)) {
    return {
      error: "Tu plan actual no permite crear usuarios con rol mozo.",
      campo: "rol",
      valores,
    };
  }

  const supabase = await crearClienteServidor();

  // 4. Límite de usuarios: chequeo previo para no crear un usuario en Auth
  // que enseguida haya que revertir. El trigger `validar_limite_usuarios`
  // (paso 8) es el que manda de verdad; esto solo evita el viaje de más en
  // el caso común.
  const { data: ocupados, error: errorOcupados } = await supabase.rpc(
    "usuarios_ocupados",
    { p_comercio: contexto.comercio.id },
  );

  if (errorOcupados || ocupados === null) {
    return { error: "No se pudo validar el límite. Probá de nuevo.", valores };
  }

  if (ocupados >= contexto.comercio.limite_usuarios) {
    return {
      error:
        "Llegaste al límite de usuarios de tu plan. Desactivá a alguien o pedí una ampliación.",
      valores,
    };
  }

  // 5. Si el rol es `sector`, los sectores elegidos tienen que existir, ser
  // de este comercio y estar activos (no confiar en los checkboxes del
  // form).
  let sectoresValidos: string[] = [];
  if (rol === "sector") {
    const { data: sectores, error: errorSectoresValidos } = await supabase
      .from("sectores")
      .select("id")
      .eq("comercio_id", contexto.comercio.id)
      .eq("activo", true)
      .in("id", sectorIds);

    if (errorSectoresValidos) {
      return {
        error: "No se pudieron validar los sectores. Probá de nuevo.",
        valores,
      };
    }

    sectoresValidos = (sectores ?? []).map((sector) => sector.id);
    if (sectoresValidos.length !== sectorIds.length) {
      return {
        error: "Uno de los sectores elegidos ya no está disponible.",
        campo: "sectores",
        valores,
      };
    }
  }

  // 6. Nombre de usuario libre. Único en todo el sistema, no por comercio
  // (ver supabase/schema.sql): `usuario_disponible` es security definer
  // justamente porque una consulta común, acotada por RLS al propio
  // comercio, no vería un choque con el personal de otro.
  const { data: usuarioLibre, error: errorUsuarioLibre } = await supabase.rpc(
    "usuario_disponible",
    { p_usuario: usuario },
  );

  if (errorUsuarioLibre) {
    return {
      error: "No se pudo validar el nombre de usuario. Probá de nuevo.",
      valores,
    };
  }

  if (!usuarioLibre) {
    const sugerencia = await sugerirUsuarioAlternativo(supabase, usuario);
    return {
      error: "Ese nombre de usuario ya está en uso.",
      campo: "usuario",
      sugerenciaUsuario: sugerencia ?? undefined,
      valores,
    };
  }

  // 7. Crear el usuario en Auth. Necesita la service_role key: la API de
  // administración de Auth no es alcanzable con la clave anónima. El email
  // es interno (nunca se muestra, ver src/lib/usuarios/email-interno.ts);
  // la contraseña sale de lo que tipeó el dueño o, si eligió que se
  // genere, de acá mismo.
  const passwordFinal =
    modoPassword === "generar" ? generarPasswordTemporal() : password;

  const admin = crearClienteAdmin();
  const { data: usuarioCreado, error: errorAuth } =
    await admin.auth.admin.createUser({
      email: construirEmailInterno(usuario),
      password: passwordFinal,
      email_confirm: true,
      // El trigger `crear_perfil_nuevo_usuario` (supabase/schema.sql) toma
      // `nombre` y `usuario` de `raw_user_meta_data`, que es donde termina
      // `user_metadata`.
      user_metadata: { nombre, usuario },
    });

  if (errorAuth || !usuarioCreado.user) {
    // Con el chequeo del paso 6, esto solo pasa por una carrera (otra alta
    // con el mismo usuario justo entre medio) — se trata igual que un
    // choque de nombre de usuario, con una sugerencia fresca.
    const sugerencia = await sugerirUsuarioAlternativo(supabase, usuario);
    return {
      error: "Ese nombre de usuario ya está en uso.",
      campo: "usuario",
      sugerenciaUsuario: sugerencia ?? undefined,
      valores,
    };
  }

  // 8. Membresía (RLS: `miembros_duenio`, cuyo `with check` además exige
  // `rol <> 'duenio'` — doble candado con la validación del paso 1).
  const { data: miembroCreado, error: errorMiembro } = await supabase
    .from("miembros")
    .insert({
      comercio_id: contexto.comercio.id,
      perfil_id: usuarioCreado.user.id,
      rol,
    })
    .select("id")
    .single();

  if (errorMiembro || !miembroCreado) {
    const { error: errorRevertir } = await admin.auth.admin.deleteUser(
      usuarioCreado.user.id,
    );
    if (errorRevertir) {
      console.error(
        `[crearUsuario] quedó el usuario de Auth ${usuarioCreado.user.id} sin revertir` +
          ` (falló la creación de la membresía en el comercio ${contexto.comercio.id}): ${errorRevertir.message}`,
      );
    }
    // El motivo esperable de que esto falle es una carrera con otra alta
    // simultánea contra el trigger de límite (ya se chequeó en el paso 4,
    // antes de crear el usuario de Auth): se muestra tal cual, está escrito
    // para leerse.
    return {
      error:
        errorMiembro?.message ?? "No se pudo crear el usuario. Probá de nuevo.",
      valores,
    };
  }

  // 9. Asignación de sectores (solo rol `sector`).
  if (rol === "sector" && sectoresValidos.length > 0) {
    const { error: errorSectoresInsert } = await supabase
      .from("miembro_sectores")
      .insert(
        sectoresValidos.map((sectorId) => ({
          comercio_id: contexto.comercio.id,
          miembro_id: miembroCreado.id,
          sector_id: sectorId,
        })),
      );

    if (errorSectoresInsert) {
      const { error: errorRevertir } = await admin.auth.admin.deleteUser(
        usuarioCreado.user.id,
      );
      if (errorRevertir) {
        console.error(
          `[crearUsuario] quedó el usuario de Auth ${usuarioCreado.user.id} sin revertir` +
            ` (falló la asignación de sectores en el comercio ${contexto.comercio.id}): ${errorRevertir.message}`,
        );
      }
      return {
        error: "No se pudo asignar los sectores. Probá de nuevo.",
        valores,
      };
    }
  }

  revalidatePath("/app/usuarios");

  // Si la contraseña la puso el dueño, no hay nada más que mostrar. Si la
  // generó el sistema, hay que mostrársela antes de irse: no se puede
  // redirigir todavía.
  if (modoPassword === "manual") {
    redirect("/app/usuarios");
  }

  return { creado: { usuario, passwordGenerada: passwordFinal } };
}
