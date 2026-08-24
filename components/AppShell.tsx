"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const PRIMARY = [
  { href: "/", label: "Heute", icon: "◆" },
  { href: "/training", label: "Training", icon: "▦" },
  { href: "/pruefung", label: "Prüfung", icon: "◷" },
  { href: "/fehler", label: "Fehler", icon: "✕" },
  { href: "/fortschritt", label: "Fortschritt", icon: "◔" },
  { href: "/textschreiben", label: "Schreiben", icon: "✎" },
  { href: "/tutor", label: "KI", icon: "✦" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-[232px] md:shrink-0 md:flex-col md:border-r md:border-line md:bg-paper md:px-4 md:py-6 md:sticky md:top-0 md:h-screen">
        <Link href="/" className="px-3 pb-6 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white text-sm font-bold">M</span>
          <span className="font-semibold tracking-tight">Multicheck<span className="text-ink-faint font-normal"> Coach</span></span>
        </Link>
        <nav className="flex flex-col gap-1">
          {PRIMARY.map((t) => {
            const active = path === t.href;
            return (
              <Link key={t.href} href={t.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${active ? "bg-brand-soft text-brand font-medium" : "text-ink-soft hover:bg-page"}`}>
                <span className="w-4 text-center text-[13px] opacity-70">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3 pt-6 text-2xs text-ink-faint">Attest (EBA) · Trainingsmodus</div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 pb-24 md:pb-0">
        <div className="shell py-7 max-w-shell">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-paper/95 backdrop-blur flex justify-around px-1 py-1.5">
        {PRIMARY.slice(0, 5).map((t) => {
          const active = path === t.href;
          return (
            <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-2xs ${active ? "text-brand" : "text-ink-muted"}`}>
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
