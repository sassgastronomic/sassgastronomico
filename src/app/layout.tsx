import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// El título de las pantallas internas: el login, /app y /admin. Las dos
// páginas públicas (la landing y el seguimiento del pedido) arman el suyo
// con el nombre del comercio en su propio generateMetadata y pisan este.
// Por eso acá no hay `template`: al cliente que abre la carta no le tiene
// que aparecer el nombre del sistema colgado del nombre del local.
export const metadata: Metadata = {
  title: "micomanda",
  description:
    "Pedidos, salón y caja del local, desde el celular de quien atiende.",
};

// Next ya emite estos dos valores por defecto; quedan explícitos porque esto
// se usa casi todo desde un celular y es una decisión, no un descuido.
//
// Sin maximumScale ni userScalable: el cliente tiene que poder agrandar la
// carta con los dedos si no llega a leerla, y el mozo también. Bloquear el
// zoom deja afuera a quien ve poco.
//
// Ojo: esto NO es lo que hace que iOS agrande la página al tocar un campo.
// Eso pasa cuando el campo tiene letra de menos de 16px (ver ESTILO_INPUT_BASE
// en los formularios y el login).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      // En español: con "en", Chrome le ofrece al cliente de la landing
      // "traducir del inglés" una página que ya está en castellano.
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
