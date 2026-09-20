import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { RolMiembro } from "@/types/database";

import { desactivarUsuario } from "./acciones-listado";

type SectorAsignado = { id: string; nombre: string };

type UsuarioListado = {
  id: string;
  nombre: string;
  // Email real si es dueño; nombre de usuario si no (nunca el email interno
  // — ver docs/SCHEMA.md, "Identificación del personal").
  identificador: string | null;
  rol: RolMiembro;
  activo: boolean;
  esDuenio: boolean;
  sectores: SectorAsignado[];
};

type ResultadoUsuarios =
  | { usuarios: UsuarioListado[]; ocupados: number; error: null }
  | { usuarios: null; ocupados: null; error: string };

const ETIQUETA_ROL: Record<RolMiembro, string> = {
  duenio: "Dueño",
  mostrador: "Mostrador",
  mozo: "Mozo",
  sector: "Sector",
};

/**
 * Personal del comercio más, de una consulta aparte (`usuarios_ocupados`
 * por RPC, fuente de verdad: es un solo comercio, sin costo de N+1), cuántos
 * ocupan el límite de usuarios — no es lo mismo que "activos" a secas, ver
 * src/lib/miembros/plan.ts.
 *
 * `miembro_sectores(sectores(...))` viene embebido en la misma consulta
 * (mismo mecanismo que `obtenerContextoComercio`): solo importa para
 * miembros con rol `sector`, se ignora para el resto.
 */
async function obtenerUsuarios(comercioId: string): Promise<ResultadoUsuarios> {
  const supabase = await crearClienteServidor();

  const { data: miembros, error: errorMiembros } = await supabase
    .from("miembros")
    .select(
      "id, rol, activo, perfiles(nombre, email, usuario), miembro_sectores(sectores(id, nombre))",
    )
    .eq("comercio_id", comercioId)
    .order("creado_en", { ascending: true });

  if (errorMiembros || !miembros) {
    return {
      usuarios: null,
      ocupados: null,
      error: "No se pudo cargar el personal. Probá de nuevo en un momento.",
    };
  }

  const { data: ocupados, error: errorOcupados } = await supabase.rpc(
    "usuarios_ocupados",
    { p_comercio: comercioId },
  );

  if (errorOcupados || ocupados === null) {
    return {
      usuarios: null,
      ocupados: null,
      error: "No se pudo cargar el personal. Probá de nuevo en un momento.",
    };
  }

  const usuarios: UsuarioListado[] = miembros
    .filter((miembro) => miembro.perfiles !== null)
    .map((miembro) => ({
      id: miembro.id,
      nombre: miembro.perfiles!.nombre,
      identificador:
        miembro.rol === "duenio"
          ? miembro.perfiles!.email
          : miembro.perfiles!.usuario,
      rol: miembro.rol,
      activo: miembro.activo,
      esDuenio: miembro.rol === "duenio",
      sectores: miembro.miembro_sectores
        .map((asignacion) => asignacion.sectores)
        .filter((sector): sector is SectorAsignado => sector !== null),
    }))
    // El dueño primero, después el resto en el orden en que ya vinieron
    // (creado_en asc). Array.prototype.sort es estable, así que esto no
    // reordena nada más que eso.
    .sort((a, b) => Number(b.esDuenio) - Number(a.esDuenio));

  return { usuarios, ocupados, error: null };
}

export default async function PaginaUsuarios() {
  // Autorización propia, sin depender del menú: solo dueño.
  const contexto = await obtenerContextoComercio();
  if (contexto.tipo !== "activo") {
    redirect("/app");
  }
  if (contexto.rol !== "duenio") {
    redirect("/app");
  }

  const resultado = await obtenerUsuarios(contexto.comercio.id);

  if (resultado.error !== null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Usuarios</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {resultado.error}
        </p>
      </div>
    );
  }

  const { usuarios, ocupados } = resultado;
  const limite = contexto.comercio.limite_usuarios;
  const enElLimite = ocupados >= limite;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Usuarios</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {ocupados} de {limite} usuarios
          </p>
        </div>

        {enElLimite ? (
          <div className="text-right">
            <span className="inline-block cursor-not-allowed rounded-md bg-neutral-300 px-3 py-2 text-sm font-medium text-neutral-500">
              Crear usuario
            </span>
            <p className="mt-1 max-w-xs text-xs text-amber-600">
              Llegaste al límite de tu plan: desactivá a alguien o pedí una
              ampliación.
            </p>
          </div>
        ) : (
          <Link
            href="/app/usuarios/nuevo"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Crear usuario
          </Link>
        )}
      </div>

      {usuarios.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="text-sm text-neutral-500">
            Todavía no hay personal cargado.
          </p>
        </div>
      )}

      {usuarios.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Nombre
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Usuario / Email
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Rol
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Sectores
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Estado
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {usuarios.map((usuario) => {
                const hrefEditar = `/app/usuarios/${usuario.id}`;
                return (
                  <tr key={usuario.id} className="hover:bg-neutral-50">
                    <td className="p-0">
                      {usuario.esDuenio ? (
                        <div className="px-4 py-3">
                          <p className="font-medium text-neutral-900">
                            {usuario.nombre}
                          </p>
                        </div>
                      ) : (
                        <Link
                          href={hrefEditar}
                          className="block px-4 py-3 font-medium text-neutral-900"
                        >
                          {usuario.nombre}
                        </Link>
                      )}
                    </td>
                    <td className="p-0">
                      <span className="block px-4 py-3 text-neutral-700">
                        {usuario.identificador ?? "—"}
                      </span>
                    </td>
                    <td className="p-0">
                      <span className="block px-4 py-3">
                        {usuario.esDuenio ? (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                            Dueño
                          </span>
                        ) : (
                          ETIQUETA_ROL[usuario.rol]
                        )}
                      </span>
                    </td>
                    <td className="p-0">
                      <span className="block px-4 py-3 text-neutral-700">
                        {usuario.rol === "sector"
                          ? (usuario.sectores.map((s) => s.nombre).join(", ") ||
                            "—")
                          : "—"}
                      </span>
                    </td>
                    <td className="p-0">
                      <span className="block px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            usuario.activo
                              ? "bg-green-50 text-green-700 ring-green-600/20"
                              : "bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                          }`}
                        >
                          {usuario.activo ? "Activo" : "Inactivo"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!usuario.esDuenio && (
                        <div className="flex justify-end gap-2">
                          <Link
                            href={hrefEditar}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100"
                          >
                            Editar
                          </Link>
                          {usuario.activo && (
                            <form
                              action={desactivarUsuario.bind(null, usuario.id)}
                            >
                              <button
                                type="submit"
                                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition hover:bg-neutral-100"
                              >
                                Desactivar
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
