import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multicheck® Attest (EBA) — Lern-Coach",
  description:
    "Adaptiver Lern-Coach für die Multicheck Attest (EBA) Prüfung. Diagnose, personalisierter Plan, KI-Nachhilfe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
