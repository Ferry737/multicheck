"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Heute" },
  { href: "/training", label: "Training" },
  { href: "/pruefung", label: "Prüfung" },
  { href: "/fehler", label: "Fehler" },
  { href: "/fortschritt", label: "Fortschritt" },
  { href: "/textschreiben", label: "Schreiben" },
  { href: "/tutor", label: "KI" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
      <div className="container-x flex items-center gap-1 overflow-x-auto py-2">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${path === t.href ? "bg-ink text-white" : "text-ink-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
