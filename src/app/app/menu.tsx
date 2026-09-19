"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type ItemMenu = {
  href: string;
  etiqueta: string;
};

/**
 * Menú de secciones de /app. La lista de secciones ya viene filtrada por
 * plan y rol desde el layout (Server Component); acá solo se decide qué
 * link está activo (necesita `usePathname`, por eso es Client Component) y
 * se maneja el colapso a hamburguesa en pantallas chicas — mozos y personal
 * de sector suelen entrar desde el celular o una tablet.
 */
export function MenuApp({ secciones }: { secciones: ItemMenu[] }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <div className="border-b border-neutral-200 bg-white px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          aria-controls="menu-app"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          <span aria-hidden="true">☰</span>
          Menú
        </button>
      </div>

      <nav
        id="menu-app"
        aria-label="Secciones"
        className={`${abierto ? "block" : "hidden"} shrink-0 border-b border-neutral-200 bg-white px-2 py-2 lg:block lg:w-56 lg:border-b-0 lg:border-r lg:px-3 lg:py-6`}
      >
        <ul className="space-y-1">
          {secciones.map((seccion) => {
            const activa = pathname.startsWith(seccion.href);
            return (
              <li key={seccion.href}>
                <Link
                  href={seccion.href}
                  onClick={() => setAbierto(false)}
                  aria-current={activa ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    activa
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {seccion.etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
