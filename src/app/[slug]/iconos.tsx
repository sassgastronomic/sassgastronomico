import type { SVGProps } from "react";

// Íconos de línea simples para las pantallas públicas. Siempre acompañan a
// un texto (nunca son la única pista), por eso van con aria-hidden.
function Icono({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconoLocal(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M4 11v9h16v-9" />
      <path d="M3 10 5 4h14l2 6" />
      <path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M10 20v-5h4v5" />
    </Icono>
  );
}

export function IconoReloj(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icono>
  );
}

export function IconoOlla(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M4 11h16v2a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" />
      <path d="M2 11h2M20 11h2" />
      <path d="M9 4c-1 1 1 2 0 4M13 3c-1 1.5 1 2.5 0 5M17 4c-1 1 1 2 0 4" />
    </Icono>
  );
}

export function IconoListo(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </Icono>
  );
}

export function IconoBolsa(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M5 8h14l-1.2 12H6.2z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </Icono>
  );
}

export function IconoCancelado(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </Icono>
  );
}

export function IconoChat(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z" />
      <path d="M9 10.5h6M9 13.5h4" />
    </Icono>
  );
}

export function IconoCerrar(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icono>
  );
}

export function IconoMas(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icono>
  );
}

export function IconoMenos(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M5 12h14" />
    </Icono>
  );
}

export function IconoCopiar(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </Icono>
  );
}

export function IconoCompartir(props: SVGProps<SVGSVGElement>) {
  return (
    <Icono {...props}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </Icono>
  );
}
