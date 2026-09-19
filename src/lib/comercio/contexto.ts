import "server-only";

import { redirect } from "next/navigation";

import { crearClienteServidor } from "@/lib/supabase/server";
import type { Database, RolMiembro } from "@/types/database";

type ComercioContexto = Pick<
  Database["public"]["Tables"]["comercios"]["Row"],
  "id" | "nombre" | "slug" | "plan" | "estado" | "limite_usuarios"
>;

type SectorAsignado = Pick<
  Database["public"]["Tables"]["sectores"]["Row"],
  "id" | "nombre"
>;

export type ContextoComercio =
  // Sin membresía activa en ningún comercio (o nunca la tuvo).
  | { tipo: "sin_membresia" }
  // Es miembro, pero el comercio está suspendido: no se muestra nada más.
  | { tipo: "suspendido"; comercio: Pick<ComercioContexto, "nombre"> }
  | {
      tipo: "activo";
      comercio: ComercioContexto;
      rol: RolMiembro;
      usuario: { id: string; email: string | null; nombre: string };
      // Sectores que este miembro tiene asignados en `miembro_sectores`
      // (solo importa para rol 'sector'; el dueño ve todos los sectores
      // activos igual, sin necesidad de asignación explícita). Se calcula
      // acá para no repetir la consulta en cada pantalla de sector.
      sectoresAsignados: SectorAsignado[];
    };

/**
 * Sesión + membresía del usuario actual en su comercio, pensada para
 * llamarse desde cualquier página bajo /app sin repetir la consulta.
 *
 * Si no hay sesión, redirige a /login acá mismo (no hay ningún caso en que
 * una página de /app quiera manejar "no logueado" distinto a eso). Los
 * demás estados (sin membresía / comercio suspendido / todo activo) se
 * devuelven para que cada página decida qué mostrar — hoy los maneja
 * `src/app/app/layout.tsx`.
 *
 * Nota: un usuario puede ser miembro de varios comercios (docs/SCHEMA.md).
 * Elegir en cuál "entrar" queda fuera de alcance por ahora: se toma el
 * primero por fecha de alta (`creado_en` ascendente) y se ignoran los
 * demás. Cuando se soporte multi-comercio, este es el lugar para resolver
 * eso (por ejemplo con un selector o una cookie de "comercio activo").
 */
export async function obtenerContextoComercio(): Promise<ContextoComercio> {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Una sola consulta: la membresía activa más antigua del usuario, con su
  // propio perfil, el comercio y los sectores que tiene asignados (si los
  // tiene) embebidos por las FK correspondientes — ver `Relationships` en
  // src/types/database.ts. Una membresía inactiva (`activo = false`) se
  // trata igual que no tener ninguna: RLS tampoco le deja hacer nada en ese
  // comercio de todas formas (`tiene_rol` exige `m.activo`).
  const { data: miembro } = await supabase
    .from("miembros")
    .select(
      "rol, perfiles(nombre), comercios(id, nombre, slug, plan, estado, limite_usuarios), miembro_sectores(sectores(id, nombre))",
    )
    .eq("perfil_id", user.id)
    .eq("activo", true)
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!miembro || !miembro.comercios || !miembro.perfiles) {
    return { tipo: "sin_membresia" };
  }

  if (miembro.comercios.estado === "suspendido") {
    return {
      tipo: "suspendido",
      comercio: { nombre: miembro.comercios.nombre },
    };
  }

  const sectoresAsignados = miembro.miembro_sectores
    .map((asignacion) => asignacion.sectores)
    .filter((sector): sector is SectorAsignado => sector !== null);

  return {
    tipo: "activo",
    comercio: miembro.comercios,
    rol: miembro.rol,
    usuario: {
      id: user.id,
      email: user.email ?? null,
      nombre: miembro.perfiles.nombre,
    },
    sectoresAsignados,
  };
}
