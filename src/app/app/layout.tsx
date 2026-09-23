import { cerrarSesion } from "@/lib/auth/actions";
import { obtenerContextoComercio } from "@/lib/comercio/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { PlanComercio, RolMiembro } from "@/types/database";

import { MenuApp, type ItemMenu } from "./menu";

const ETIQUETA_ROL: Record<RolMiembro, string> = {
  duenio: "Dueño",
  mostrador: "Mostrador",
  mozo: "Mozo",
  sector: "Sector",
};

type SectorVisible = { id: string; nombre: string };

/**
 * Arma las secciones visibles para este rol y plan (docs/SCHEMA.md, "Roles"
 * y "Planes"). Una entrada de menú por sector visible: el dueño ve todos
 * los sectores activos del comercio; un rol `sector` ve solo los que tiene
 * asignados en `miembro_sectores` (ver src/lib/comercio/contexto.ts). Ya no
 * hay "Cocina"/"Barra" fijos ni se matchea por nombre de sector.
 */
function construirSecciones({
  rol,
  plan,
  sectoresVisibles,
}: {
  rol: RolMiembro;
  plan: PlanComercio;
  sectoresVisibles: SectorVisible[];
}): ItemMenu[] {
  const secciones: ItemMenu[] = [];

  if (rol === "duenio") {
    secciones.push({ href: "/app/carta", etiqueta: "Carta" });
  }

  if (rol === "duenio" || rol === "mostrador") {
    secciones.push({ href: "/app/pedidos", etiqueta: "Pedidos" });
  }

  // Dos pantallas de mesas, para dos tareas distintas: "Atender mesas" es
  // operativa (abrir cuentas, ver quién está ocupado) y la usa también el
  // mozo; "Configurar mesas" es administración (crear zonas y mesas,
  // activar/desactivar) y es solo del dueño — antes había una sola entrada
  // de menú ("Mesas") que apuntaba a la de administración pero se mostraba
  // también al mozo, que al entrar rebotaba (la página ya exigía
  // rol === "duenio").
  if (
    (plan === "salon" || plan === "completo") &&
    (rol === "duenio" || rol === "mozo")
  ) {
    secciones.push({ href: "/app/salon", etiqueta: "Atender mesas" });
  }

  if ((plan === "salon" || plan === "completo") && rol === "duenio") {
    secciones.push({ href: "/app/mesas", etiqueta: "Configurar mesas" });
  }

  for (const sector of sectoresVisibles) {
    secciones.push({
      href: `/app/sector/${sector.id}`,
      etiqueta: sector.nombre,
    });
  }

  if (rol === "duenio") {
    secciones.push({ href: "/app/usuarios", etiqueta: "Usuarios" });
  }

  return secciones;
}

export default async function LayoutApp({ children }: LayoutProps<"/app">) {
  const contexto = await obtenerContextoComercio();

  if (contexto.tipo === "sin_membresia") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-neutral-900">
            Todavía no formás parte de ningún comercio
          </h1>
          <p className="mb-6 text-sm text-neutral-500">
            Tu cuenta no tiene ninguna membresía activa. Si esto es un error,
            pedile al dueño de tu comercio (o al administrador) que te dé de
            alta.
          </p>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (contexto.tipo === "suspendido") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-amber-900">
            Servicio suspendido
          </h1>
          <p className="mb-6 text-sm text-amber-800">
            {contexto.comercio.nombre} tiene el servicio suspendido.
            Contactate con el administrador de la plataforma para
            reactivarlo.
          </p>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="w-full rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </main>
    );
  }

  const { comercio, rol, usuario, sectoresAsignados } = contexto;

  // Sectores visibles en el menú: todos los activos del comercio si es
  // dueño, o los que tiene asignados en miembro_sectores si es rol
  // 'sector' (ya vienen en el contexto, sin consulta aparte).
  let sectoresVisibles: SectorVisible[] = [];

  if (rol === "duenio") {
    const supabase = await crearClienteServidor();
    const { data: sectores } = await supabase
      .from("sectores")
      .select("id, nombre")
      .eq("comercio_id", comercio.id)
      .eq("activo", true)
      .order("orden", { ascending: true });
    sectoresVisibles = sectores ?? [];
  } else if (rol === "sector") {
    sectoresVisibles = sectoresAsignados;
  }

  const secciones = construirSecciones({
    rol,
    plan: comercio.plan,
    sectoresVisibles,
  });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {comercio.nombre}
          </p>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm text-neutral-900">{usuario.nombre}</p>
              <p className="text-xs text-neutral-500">{ETIQUETA_ROL[rol]}</p>
            </div>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <MenuApp secciones={secciones} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
