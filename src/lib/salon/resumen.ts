export type ItemConsumido = {
  nombre: string;
  categoriaNombre: string | null;
  precioUnitario: number;
  cantidad: number;
  adicionales: { nombre: string; precioExtra: number }[];
};

export type LineaResumen = {
  clave: string;
  cantidad: number;
  nombre: string;
  categoriaNombre: string | null;
  adicionalesConCosto: { nombre: string; precioExtra: number }[];
  // Precio de una unidad con sus adicionales, y el de toda la línea.
  precioUnidad: number;
  subtotal: number;
};

export type ResumenCuenta = { lineas: LineaResumen[]; total: number };

function aCentavos(monto: number): number {
  return Math.round(monto * 100);
}

/**
 * Lo consumido en una mesa, agrupado para decírselo al cliente: el mismo
 * producto, de la misma categoría, al mismo precio y con los mismos
 * adicionales con costo, va en una sola línea aunque venga de rondas
 * distintas. Las notas y los adicionales sin cargo ("sin cebolla") no
 * separan líneas: no cambian lo que se paga.
 *
 * Se suma en centavos para que el total no arrastre errores de redondeo
 * de los decimales.
 */
export function armarResumen(items: ItemConsumido[]): ResumenCuenta {
  const porClave = new Map<string, LineaResumen>();

  for (const item of items) {
    const adicionalesConCosto = item.adicionales
      .filter((adicional) => adicional.precioExtra > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const unidadCentavos =
      aCentavos(item.precioUnitario) +
      adicionalesConCosto.reduce(
        (suma, adicional) => suma + aCentavos(adicional.precioExtra),
        0,
      );
    const clave = JSON.stringify([
      item.nombre,
      item.categoriaNombre,
      aCentavos(item.precioUnitario),
      adicionalesConCosto.map((a) => [a.nombre, aCentavos(a.precioExtra)]),
    ]);

    const existente = porClave.get(clave);
    if (existente) {
      existente.cantidad += item.cantidad;
      existente.subtotal = (existente.cantidad * unidadCentavos) / 100;
    } else {
      porClave.set(clave, {
        clave,
        cantidad: item.cantidad,
        nombre: item.nombre,
        categoriaNombre: item.categoriaNombre,
        adicionalesConCosto,
        precioUnidad: unidadCentavos / 100,
        subtotal: (item.cantidad * unidadCentavos) / 100,
      });
    }
  }

  const lineas = [...porClave.values()];
  const totalCentavos = lineas.reduce(
    (suma, linea) => suma + aCentavos(linea.subtotal),
    0,
  );
  return { lineas, total: totalCentavos / 100 };
}
