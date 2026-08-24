import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Multicheck® Attest (EBA) — Trainings-Coach",
  description: "Unabhängiges Vorbereitungswerkzeug für die Multicheck Attest (EBA) Prüfung.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Nav />
        {children}
        <footer className="container-x py-6 text-center text-xs text-ink-faint">
          Unabhängiges Vorbereitungswerkzeug — nicht verbunden mit gateway.one oder Multicheck®.
          Trainingswerte sind keine offiziellen Multicheck-Ergebnisse.
        </footer>
      </body>
    </html>
  );
}
