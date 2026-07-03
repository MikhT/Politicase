import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Politicase — La politica italiana, misurata con i fatti",
  description:
    "Piattaforma open source di trasparenza politica: tutti i parlamentari italiani, le loro dichiarazioni e la coerenza tra ciò che dicono e ciò che fanno.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <header className="bg-primary text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-xl font-bold tracking-tight">
              Politicase
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link href="/" className="hover:underline">
                Parlamentari
              </Link>
              <Link href="/dichiarazioni" className="hover:underline">
                Dichiarazioni
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-gray-500">
            <p>
              Dati da fonti aperte ufficiali:{" "}
              <a href="https://dati.camera.it" className="underline">
                dati.camera.it
              </a>
              ,{" "}
              <a href="https://dati.senato.it" className="underline">
                dati.senato.it
              </a>
              , ANSA. Progetto open source per la trasparenza politica.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
