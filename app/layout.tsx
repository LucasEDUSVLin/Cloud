import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloud | Gestão de STUCK",
  description: "Acompanhamento de mercadorias paradas em STUCK.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
