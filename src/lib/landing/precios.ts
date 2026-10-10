// Precios para el cliente: sin ",00" cuando el monto es entero ("$ 12.000",
// no "$ 12.000,00"), con dos decimales cuando no lo es ("$ 1.250,50").
const formateadorEntero = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const formateadorDecimal = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearPrecio(monto: number): string {
  return Number.isInteger(monto)
    ? formateadorEntero.format(monto)
    : formateadorDecimal.format(monto);
}

function aCentavos(monto: number): number {
  return Math.round(monto * 100);
}

/**
 * Lo que sale una línea del pedido: (precio + adicionales) × cantidad.
 * En centavos, para no arrastrar errores de redondeo de los decimales —
 * mismo criterio que src/lib/salon/resumen.ts.
 */
export function subtotalLinea(
  precioUnitario: number,
  preciosAdicionales: number[],
  cantidad: number,
): number {
  const unidad =
    aCentavos(precioUnitario) +
    preciosAdicionales.reduce((suma, precio) => suma + aCentavos(precio), 0);
  return (unidad * cantidad) / 100;
}

export function sumarMontos(montos: number[]): number {
  return montos.reduce((suma, monto) => suma + aCentavos(monto), 0) / 100;
}

// Total de un pedido ya guardado, con las copias de precio de la base
// (`seguimiento_pedido`): lo que de verdad se le va a cobrar.
export function totalDelPedido(
  items: {
    precio_unitario: number;
    cantidad: number;
    adicionales: { precio_extra: number }[];
  }[],
): number {
  return sumarMontos(
    items.map((item) =>
      subtotalLinea(
        item.precio_unitario,
        item.adicionales.map((adicional) => adicional.precio_extra),
        item.cantidad,
      ),
    ),
  );
}
