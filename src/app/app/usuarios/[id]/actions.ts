"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { planPermiteRol } from "@/lib/miembros/plan";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { generarPasswordTemporal } from "@/lib/usuarios/password";
import {
  esRolAsignable,
  validarNombreUsuario,
  validarPasswordManual,
  validarSectoresAsignados,
} from "@/lib/usuarios/validacion";

export type CampoEditarUsuario = "nombre" | "rol" | "sectores" | "activo";

export type EstadoEditarUsuario = {
  error?: string;
  campo?: CampoEditarUsuario;
  valores?: {
    nombre: string;
    rol: string;
    sectorIds: string[];
    activo: string;
  };
};

export type EstadoResetearPassword = {
  error?: string;
  campo?: "password";
  // Presente solo si el modo fue "generar" y salió bien: hay que mostrarla
  // una vez. En modo "manual" no hay nada sensible que reflejar de vuelta.
  passwordGenerada?: string;
  actualizada?: boolean;
};

/**
 * Trae el miembro a editar, ya acotado al comercio del dueño que invoca.
 * Usado tanto por `actualizarUsuario` como por `resetearPassword` para no
 * repetir el mismo candado dos veces: ninguna de las dos deja tocar al
 * dueño ni a uno mismo (ver docs/SCHEMA.md, "Roles").
 */
async function obtenerMiembroEditable(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  id: string,
  comercioId: string,
  perfilPropio: string,
) {
  const { data: miembro, error } = await supabase
    .from("miembros")
    .select("id, rol, perfil_id")
    .eq("id", id)
    .eq("comercio_id", comercioId)
    .single();

  if (error || !miembro) return null;
  if (miembro.rol === "duenio" || miembro.perfil_id === perfilPropio) return null;

  return miembro;
}

/**
 * Actualiza rol, sectores asignados, estado y nombre de un miembro del
 * personal. El nombre vive en `perfiles` (compartido entre comercios si la
 * persona está en más de uno), así que se actualiza con la función
 * `actualizar_nombre_miembro` (supabase/schema.sql) en vez de un `.update()`
 * directo: `perfiles` no tiene policy de UPDATE para "soy dueño de esta
 * persona en algún comercio" a propósito, es una tabla sensible.
 */
export async function actualizarUsuario(
  _estadoPrevio: EstadoEditarUsuario,
  formData: FormData,
): Promise<EstadoEditarUsuario> {
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = String(formData.get("rol") ?? "");
  const sectorIds = [...new Set(formData.getAll("sector_id").map(String))];
  const activoTexto = String(formData.get("activo") ?? "");

  if (!id) {
    return { error: "Falta el usuario a editar." };
  }

  const valores: NonNullable<EstadoEditarUsuario["valores"]> = {
    nombre,
    rol,
    sectorIds,
    activo: activoTexto,
  };

  // 1. Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint. `duenio` nunca es un rol válido acá.
  const errorNombre = validarNombreUsuario(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  if (!esRolAsignable(rol)) {
    return { error: "Elegí un rol válido.", campo: "rol", valores };
  }

  const errorSectores = validarSectoresAsignados(rol, sectorIds);
  if (errorSectores) {
    return { error: errorSectores, campo: "sectores", valores };
  }

  if (activoTexto !== "true" && activoTexto !== "false") {
    return { error: "Elegí un estado válido.", campo: "activo", valores };
  }
  const activo = activoTexto === "true";

  // 2. Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  // 3. El miembro tiene que existir, ser de este comercio, no ser el dueño
  // ni ser uno mismo (nunca debería llegar acá por la UI, pero la Server
  // Action es su propio endpoint).
  const miembro = await obtenerMiembroEditable(
    supabase,
    id,
    contexto.comercio.id,
    contexto.usuario.id,
  );
  if (!miembro) {
    return { error: "No se encontró el usuario." };
  }

  // 4. El plan decide si `mozo` es un rol asignable hoy — pero solo si se
  // está pidiendo ESE cambio. Un comercio que bajó de plan puede tener
  // miembros `mozo` activos de antes (docs/SCHEMA.md, "Cambio de plan": no
  // se los desactiva solo, ni el enum se los prohíbe); si el dueño solo
  // quiere renombrarlos o desactivarlos sin tocar el rol, no hace falta
  // volver a validar un rol que ya tenían de antes.
  if (rol !== miembro.rol && !planPermiteRol(contexto.comercio.plan, rol)) {
    return {
      error: "Tu plan actual no permite el rol mozo.",
      campo: "rol",
      valores,
    };
  }

  // 5. Si el rol es `sector`, los sectores elegidos tienen que ser de este
  // comercio (no hace falta que estén activos: uno ya asignado puede haber
  // dejado de estarlo, mismo criterio que sector_id en categorías).
  let sectoresValidos: string[] = [];
  if (rol === "sector") {
    const { data: sectores, error: errorSectoresValidos } = await supabase
      .from("sectores")
      .select("id")
      .eq("comercio_id", contexto.comercio.id)
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
        error: "Uno de los sectores elegidos ya no existe.",
        campo: "sectores",
        valores,
      };
    }
  }

  // 6. Actualizar rol y estado (RLS: `miembros_duenio`, cuyo `with check`
  // además exige `rol <> 'duenio'`). Si esto falla, el motivo esperable es
  // el trigger de límite (al reactivar por encima del máximo): se muestra
  // tal cual, está escrito para leerse.
  const { error: errorActualizar } = await supabase
    .from("miembros")
    .update({ rol, activo })
    .eq("id", id)
    .eq("comercio_id", contexto.comercio.id);

  if (errorActualizar) {
    return { error: errorActualizar.message, campo: "activo", valores };
  }

  // 7. Sincronizar sectores asignados. Si el rol ya no es `sector`, se
  // limpia cualquier asignación vieja (quedaría sin sentido, y confundiría
  // el listado); si lo es, se aplica la diferencia contra lo que ya había.
  const { data: actuales } = await supabase
    .from("miembro_sectores")
    .select("sector_id")
    .eq("miembro_id", id)
    .eq("comercio_id", contexto.comercio.id);

  const idsActuales = new Set((actuales ?? []).map((a) => a.sector_id));
  const idsNuevos = rol === "sector" ? new Set(sectoresValidos) : new Set<string>();

  const aInsertar = [...idsNuevos].filter((sid) => !idsActuales.has(sid));
  const aBorrar = [...idsActuales].filter((sid) => !idsNuevos.has(sid));

  if (aInsertar.length > 0) {
    const { error: errorInsertar } = await supabase.from("miembro_sectores").insert(
      aInsertar.map((sectorId) => ({
        comercio_id: contexto.comercio.id,
        miembro_id: id,
        sector_id: sectorId,
      })),
    );
    if (errorInsertar) {
      console.error(
        `[actualizarUsuario] no se pudieron asignar sectores al miembro ${id}: ${errorInsertar.message}`,
      );
    }
  }

  if (aBorrar.length > 0) {
    const { error: errorBorrar } = await supabase
      .from("miembro_sectores")
      .delete()
      .eq("miembro_id", id)
      .eq("comercio_id", contexto.comercio.id)
      .in("sector_id", aBorrar);
    if (errorBorrar) {
      console.error(
        `[actualizarUsuario] no se pudieron desasignar sectores del miembro ${id}: ${errorBorrar.message}`,
      );
    }
  }

  // 8. Nombre, vía la función que valida `tiene_rol` adentro (ver el
  // comentario arriba de esta Server Action).
  const { error: errorNombreRpc } = await supabase.rpc(
    "actualizar_nombre_miembro",
    { p_miembro_id: id, p_nombre: nombre },
  );
  if (errorNombreRpc) {
    console.error(
      `[actualizarUsuario] no se pudo actualizar el nombre del miembro ${id}: ${errorNombreRpc.message}`,
    );
  }

  revalidatePath("/app/usuarios");
  redirect("/app/usuarios");
}

/**
 * Cambia la contraseña del usuario en Auth, a elección del dueño: la
 * escribe él (mínimo 6 caracteres) o la genera el sistema. La generada se
 * devuelve una sola vez en el estado de esta acción (nunca se guarda en la
 * base): el dueño la tiene que copiar ahí mismo, no hay forma de volver a
 * verla después. La escrita a mano no se refleja de vuelta: ya la sabe.
 */
export async function resetearPassword(
  _estadoPrevio: EstadoResetearPassword,
  formData: FormData,
): Promise<EstadoResetearPassword> {
  const id = String(formData.get("id") ?? "");
  const modoPassword = String(formData.get("modo_password") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!id) {
    return { error: "Falta el usuario." };
  }

  if (modoPassword !== "manual" && modoPassword !== "generar") {
    return { error: "Elegí cómo definir la contraseña." };
  }

  if (modoPassword === "manual") {
    const errorPassword = validarPasswordManual(password);
    if (errorPassword) {
      return { error: errorPassword, campo: "password" };
    }
  }

  // Autorización: solo dueño, sin depender del menú ni de la página.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const supabase = await crearClienteServidor();

  const miembro = await obtenerMiembroEditable(
    supabase,
    id,
    contexto.comercio.id,
    contexto.usuario.id,
  );
  if (!miembro) {
    return { error: "No se encontró el usuario." };
  }

  const passwordFinal =
    modoPassword === "generar" ? generarPasswordTemporal() : password;

  // Necesita la service_role key: la API de administración de Auth no es
  // alcanzable con la clave anónima.
  const admin = crearClienteAdmin();
  const { error } = await admin.auth.admin.updateUserById(miembro.perfil_id, {
    password: passwordFinal,
  });

  if (error) {
    return { error: "No se pudo resetear la contraseña. Probá de nuevo." };
  }

  if (modoPassword === "generar") {
    return { passwordGenerada: passwordFinal };
  }
  return { actualizada: true };
}
