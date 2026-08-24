import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Multicheck® Attest (EBA) — Trainings-Coach",
  description: "Unabhängiges Vorbereitungswerkzeug für die Multicheck Attest (EBA) Prüfung.",
};
export const viewport: Viewport = { themeColor: "#F4F3F0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body className="font-sans">
        <AppShell>{children}</AppShell>
        <footer className="shell py-6 text-center text-2xs text-ink-faint">
          Unabhängiges Vorbereitungswerkzeug — nicht verbunden mit gateway.one oder Multicheck®.
          Trainingswerte sind keine offiziellen Multicheck-Ergebnisse.
        </footer>
      </body>
    </html>
  );
}
