"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Painel" },
  { href: "/historico", label: "Histórico" },
  { href: "/calibracao", label: "Calibração" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-navy-900/80 border-b border-white/10 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="font-display text-xl font-bold text-accent tracking-tight">
          OREMETRIX
        </Link>
        <div className="flex gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-accent/15 text-accent"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
