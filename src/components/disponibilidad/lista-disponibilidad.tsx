"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";

import { cambiarDisponibilidad } from "@/lib/disponibilidad/actions";
import type {
  ProductoDisponibilidad,
  SectorDisponibilidad,
} from "@/lib/disponibilidad/disponibilidad";

// Con menos productos que esto, el buscador sobra: la lista entra entera.
const MINIMO_PARA_BUSCAR = 10;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Disponibilidad durante la jornada: un interruptor por producto para
 * marcarlo sin stock o disponible. Marcar y listo, sin confirmaciones: un
 * toque se deshace con otro. El cambio se ve al instante (optimista) y, si
 * la base lo rechaza, el interruptor vuelve y se avisa.
 *
 * Arriba, lo que está sin stock ahora (para reactivarlo rápido si
 * reponen); abajo, todo, por sector (si hay más de uno a la vista) y
 * categoría, en el orden de la carta. Pensada para celular y tablet: cada
 * fila entera es el interruptor, con letra y blanco de toque grandes.
 */
export function ListaDisponibilidad({
  sectores,
  mostrarSectores,
  vacio,
}: {
  sectores: SectorDisponibilidad[];
  // El mostrador ve todos los sectores; la pantalla de un sector, solo el
  // suyo (sin título de sector).
  mostrarSectores: boolean;
  vacio: string;
}) {
  const router = useRouter();
  const [, iniciarTransicion] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Lo tocado que todavía no confirmó el servidor (id → sin stock). Al
  // terminar la acción se descarta: para entonces la pantalla ya viene
  // actualizada (la acción llama a refresh()).
  const [cambios, agregarCambio] = useOptimistic<
    Record<string, boolean>,
    { id: string; sinStock: boolean }
  >({}, (actuales, cambio) => ({ ...actuales, [cambio.id]: cambio.sinStock }));

  useEffect(() => {
    if (!error) return;
    const temporizador = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(temporizador);
  }, [error]);

  function sinStock(producto: ProductoDisponibilidad): boolean {
    return cambios[producto.id] ?? producto.sinStock;
  }

  function alternar(producto: ProductoDisponibilidad) {
    const siguiente = !sinStock(producto);
    setError(null);
    iniciarTransicion(async () => {
      agregarCambio({ id: producto.id, sinStock: siguiente });
      const resultado = await cambiarDisponibilidad(producto.id, siguiente);
      if (!resultado.ok) {
        setError(`${producto.nombre}: ${resultado.error}`);
        // Puede que otro lo haya cambiado mientras tanto: el estado real.
        router.refresh();
      }
    });
  }

  const todos = sectores.flatMap((sector) =>
    sector.categorias.flatMap((categoria) =>
      categoria.productos.map((producto) => ({ producto, categoria, sector })),
    ),
  );
  const agotados = todos.filter(({ producto }) => sinStock(producto));

  if (todos.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-14 text-center text-lg text-neutral-500">
        {vacio}
      </p>
    );
  }

  const filtro = normalizar(busqueda);
  const coincide = (texto: string) => normalizar(texto).includes(filtro);
  const sectoresVisibles = sectores
    .map((sector) => ({
      ...sector,
      categorias: sector.categorias
        .map((categoria) => ({
          ...categoria,
          productos:
            !filtro || coincide(categoria.nombre)
              ? categoria.productos
              : categoria.productos.filter((producto) => coincide(producto.nombre)),
        }))
        .filter((categoria) => categoria.productos.length > 0),
    }))
    .filter((sector) => sector.categorias.length > 0);

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-base font-semibold text-red-800"
        >
          {error}
        </p>
      )}

      <section
        aria-labelledby="titulo-sin-stock"
        className={`rounded-2xl border-2 p-4 ${
          agotados.length > 0
            ? "border-red-300 bg-red-50"
            : "border-green-200 bg-green-50"
        }`}
      >
        <h2
          id="titulo-sin-stock"
          className={`text-xl font-black ${
            agotados.length > 0 ? "text-red-900" : "text-green-900"
          }`}
        >
          {agotados.length > 0
            ? `Sin stock ahora · ${agotados.length}`
            : "Todo disponible"}
        </h2>
        {agotados.length > 0 ? (
          <>
            <p className="mt-1 text-base text-red-900">
              No se pueden pedir. Si reponen, tocalos para que vuelvan a la
              carta.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {agotados.map(({ producto, categoria, sector }) => (
                <li key={producto.id}>
                  <FilaProducto
                    nombre={producto.nombre}
                    detalle={
                      mostrarSectores
                        ? `${categoria.nombre} · ${sector.nombre}`
                        : categoria.nombre
                    }
                    sinStock
                    onAlternar={() => alternar(producto)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-base text-green-900">
            No hay nada marcado sin stock.
          </p>
        )}
      </section>

      <p className="text-base text-neutral-600">
        Tocá un producto para marcarlo sin stock: deja de poder pedirse
        enseguida, en el salón y en la página del local. Al cerrar la caja
        vuelve todo a estar disponible.
      </p>

      {todos.length >= MINIMO_PARA_BUSCAR && (
        <div>
          <label htmlFor="buscar-producto" className="sr-only">
            Buscar producto
          </label>
          <input
            id="buscar-producto"
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar producto o categoría…"
            autoComplete="off"
            className="w-full rounded-2xl border-2 border-neutral-300 bg-white px-4 py-3.5 text-lg text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
        </div>
      )}

      {sectoresVisibles.length === 0 ? (
        <p className="py-10 text-center text-lg text-neutral-500">
          No hay productos que coincidan con “{busqueda.trim()}”.
        </p>
      ) : (
        sectoresVisibles.map((sector) => (
          <section key={sector.id} aria-label={sector.nombre} className="space-y-5">
            {mostrarSectores && (
              <h2 className="border-b-2 border-neutral-200 pb-2 text-2xl font-black text-neutral-900">
                {sector.nombre}
              </h2>
            )}
            {sector.categorias.map((categoria) => (
              <div key={categoria.id} className="space-y-2">
                <h3 className="text-base font-bold tracking-wide text-neutral-500 uppercase">
                  {categoria.nombre}
                </h3>
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {categoria.productos.map((producto) => (
                    <li key={producto.id}>
                      <FilaProducto
                        nombre={producto.nombre}
                        detalle={null}
                        sinStock={sinStock(producto)}
                        onAlternar={() => alternar(producto)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

// La fila entera es el interruptor: se acierta con el dedo aunque se toque
// el nombre.
function FilaProducto({
  nombre,
  detalle,
  sinStock,
  onAlternar,
}: {
  nombre: string;
  detalle: string | null;
  sinStock: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!sinStock}
      onClick={onAlternar}
      className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99] ${
        sinStock
          ? "border-red-300 bg-white active:bg-red-50"
          : "border-neutral-200 bg-white active:bg-neutral-50"
      }`}
    >
      <span className="min-w-0">
        <span
          className={`block text-lg leading-snug font-semibold ${
            sinStock ? "text-neutral-500 line-through decoration-2" : "text-neutral-900"
          }`}
        >
          {nombre}
        </span>
        {detalle && (
          <span className="block text-sm text-neutral-500">{detalle}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span
          className={`text-base font-bold ${
            sinStock ? "text-red-700" : "text-green-700"
          }`}
        >
          {sinStock ? "Sin stock" : "Hay"}
        </span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-10 w-18 items-center rounded-full transition-colors ${
            sinStock ? "bg-neutral-300" : "bg-green-600"
          }`}
        >
          <span
            className={`absolute h-8 w-8 rounded-full bg-white shadow transition-transform ${
              sinStock ? "translate-x-1" : "translate-x-9"
            }`}
          />
        </span>
      </span>
    </button>
  );
}
