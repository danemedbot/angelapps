import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AngelApps — Retro Pong",
  description: "Un telebolito de Pong retro para probar AngelApps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
