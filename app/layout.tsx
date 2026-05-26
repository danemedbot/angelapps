import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Organizador de Datos",
  description: "Organizador de Datos DANEMED para captura y asignación de leads.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
