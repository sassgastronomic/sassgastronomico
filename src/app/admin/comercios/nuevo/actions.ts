"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  esPlanValido,
  validarEmail,
  validarLimiteUsuarios,
  validarNombreComercio,
  validarNombreDuenio,
  validarPassword,
  validarSlug,
} from "@/lib/comercios/validacion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type CampoNuevoComercio =
  | "nombre"
  | "slug"
  | "plan"
  | "limite_usuarios"
  | "duenio_nombre"
  | "duenio_email"
  | "duenio_password";

export type EstadoNuevoComercio = {
  error?: string;
  // Qué campo causó el error, para marcarlo en rojo y llevarle el foco.
  // Sin campo == error general (banner arriba del form).
  campo?: CampoNuevoComercio;
  // Todo lo que había cargado el usuario, salvo la contraseña. Un
  // `<form action={...}>` con Server Action resetea los inputs no
  // controlados después de cada envío (éxito o error), así que sin esto se
  // pierde todo lo tipeado apenas aparece un error.
  valores?: {
    nombre: string;
    slug: string;
    plan: string;
    limiteUsuarios: string;
    duenioNombre: string;
    duenioEmail: string;
  };
};

/**
 * Crea un comercio, su dueño en Auth y la membresía que los une.
 *
 * Son tres escrituras en dos sistemas distintos (Postgres + GoTrue), así que
 * no hay una transacción real que las cubra a las tres. Si un paso falla
 * después de que otro ya se aplicó, se revierte a mano el/los paso(s)
 * anteriores para no dejar un comercio sin dueño ni un usuario "flotando".
 */
export async function crearComercio(
  _estadoPrevio: EstadoNuevoComercio,
  formData: FormData,
): Promise<EstadoNuevoComercio> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const plan = String(formData.get("plan") ?? "");
  const limiteUsuariosTexto = String(formData.get("limite_usuarios") ?? "");
  const duenioNombre = String(formData.get("duenio_nombre") ?? "").trim();
  const duenioEmail = String(formData.get("duenio_email") ?? "")
    .trim()
    .toLowerCase();
  const duenioPassword = String(formData.get("duenio_password") ?? "");

  const valores: NonNullable<EstadoNuevoComercio["valores"]> = {
    nombre,
    slug,
    plan,
    limiteUsuarios: limiteUsuariosTexto,
    duenioNombre,
    duenioEmail,
  };

  // 1. Validar. Nunca confiar en lo que ya validó el <form>: esta Server
  // Action es su propio endpoint, cualquiera puede invocarla directo.
  // Chequeo campo por campo (en vez de juntar errores en un array) para
  // poder devolver cuál de todos causó el error.
  const errorNombre = validarNombreComercio(nombre);
  if (errorNombre) return { error: errorNombre, campo: "nombre", valores };

  const errorSlug = validarSlug(slug);
  if (errorSlug) return { error: errorSlug, campo: "slug", valores };

  if (!esPlanValido(plan)) {
    return { error: "Elegí un plan válido.", campo: "plan", valores };
  }

  const errorLimite = validarLimiteUsuarios(limiteUsuariosTexto);
  if (errorLimite) {
    return { error: errorLimite, campo: "limite_usuarios", valores };
  }

  const errorNombreDuenio = validarNombreDuenio(duenioNombre);
  if (errorNombreDuenio) {
    return { error: errorNombreDuenio, campo: "duenio_nombre", valores };
  }

  const errorEmail = validarEmail(duenioEmail);
  if (errorEmail) return { error: errorEmail, campo: "duenio_email", valores };

  const errorPassword = validarPassword(duenioPassword);
  if (errorPassword) {
    return { error: errorPassword, campo: "duenio_password", valores };
  }

  const limiteUsuarios = Number(limiteUsuariosTexto);

  // 2. Confirmar que quien invoca esto es admin. El layout de /admin ya
  // filtra la navegación, pero esta Server Action es un endpoint aparte:
  // alguien podría invocarla directo sin pasar por la página.
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("es_admin")
    .eq("id", user.id)
    .single();

  if (!perfil?.es_admin) {
    redirect("/app");
  }

  // 3. Crear el comercio (RLS: `comercios_admin` exige `es_admin()`).
  const { data: comercio, error: errorComercio } = await supabase
    .from("comercios")
    .insert({ nombre, slug, plan, limite_usuarios: limiteUsuarios })
    .select("id")
    .single();

  if (errorComercio || !comercio) {
    if (errorComercio?.code === "23505") {
      return {
        error: "Ese slug ya está en uso por otro comercio.",
        campo: "slug",
        valores,
      };
    }
    return { error: "No se pudo crear el comercio. Probá de nuevo.", valores };
  }

  // 4. Crear el usuario dueño en Auth. Necesita la service_role key: la API
  // de administración de Auth no es alcanzable con la clave anónima.
  const admin = crearClienteAdmin();
  const { data: usuarioCreado, error: errorUsuario } =
    await admin.auth.admin.createUser({
      email: duenioEmail,
      password: duenioPassword,
      email_confirm: true,
      // El trigger `crear_perfil_nuevo_usuario` (supabase/schema.sql) toma
      // `nombre` de `raw_user_meta_data`, que es donde termina `user_metadata`.
      user_metadata: { nombre: duenioNombre },
    });

  if (errorUsuario || !usuarioCreado.user) {
    const { error: errorRevertirComercio } = await supabase
      .from("comercios")
      .delete()
      .eq("id", comercio.id);

    if (errorRevertirComercio) {
      // No hay forma de reintentar el rollback dentro de este request. Esto
      // deja un comercio sin dueño flotando: hace falta borrarlo a mano.
      // El log es la única forma de enterarse (el admin solo ve "no se pudo
      // crear el usuario").
      console.error(
        `[crearComercio] quedó el comercio ${comercio.id} sin revertir` +
          ` (falló la creación del usuario): ${errorRevertirComercio.message}`,
      );
    }

    if (errorUsuario?.code === "email_exists") {
      return {
        error: "Ya existe un usuario con ese email.",
        campo: "duenio_email",
        valores,
      };
    }
    return {
      error: "No se pudo crear el usuario del dueño. Probá de nuevo.",
      valores,
    };
  }

  // 5. Crear la membresía como dueño (RLS: `miembros_admin`).
  const { error: errorMiembro } = await supabase.from("miembros").insert({
    comercio_id: comercio.id,
    perfil_id: usuarioCreado.user.id,
    rol: "duenio",
  });

  if (errorMiembro) {
    // Revertir todo. Borrar el usuario de Auth también borra su fila de
    // `perfiles` (FK `on delete cascade` en supabase/schema.sql). Si
    // cualquiera de las dos reversiones falla, no hay reintento posible
    // dentro de este request: quedaría un usuario de Auth sin comercio y/o
    // un comercio sin dueño, y el log es la única forma de enterarse (el
    // admin solo ve "no se pudo asignar el dueño").
    const { error: errorRevertirUsuario } = await admin.auth.admin.deleteUser(
      usuarioCreado.user.id,
    );
    if (errorRevertirUsuario) {
      console.error(
        `[crearComercio] quedó el usuario ${usuarioCreado.user.id} sin revertir` +
          ` (falló la creación de la membresía): ${errorRevertirUsuario.message}`,
      );
    }

    const { error: errorRevertirComercio } = await supabase
      .from("comercios")
      .delete()
      .eq("id", comercio.id);
    if (errorRevertirComercio) {
      console.error(
        `[crearComercio] quedó el comercio ${comercio.id} sin revertir` +
          ` (falló la creación de la membresía): ${errorRevertirComercio.message}`,
      );
    }

    return {
      error: "No se pudo asignar el dueño al comercio. Probá de nuevo.",
      valores,
    };
  }

  revalidatePath("/admin");
  redirect("/admin");
}
