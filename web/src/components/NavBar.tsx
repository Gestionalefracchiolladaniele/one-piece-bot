'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navbar condivisa: brand + le 3 sezioni. Evidenzia la rotta attiva. Sta sopra ogni
// pagina (dal layout). Sticky in alto, vetro viola sul fondo aurora.

const LINKS = [
  { href: '/', label: 'Home', emoji: '🏠' },
  { href: '/watchlist', label: 'Watchlist', emoji: '👀' },
  { href: '/collezione', label: 'Collezione', emoji: '📚' },
];

export function NavBar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[rgba(13,7,22,0.72)] backdrop-blur-md">
      <nav className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <Link href="/" className="flex items-center gap-2 font-display text-lg tracking-tight text-text-high">
          <span>🏴‍☠️</span>
          <span className="hidden sm:inline">Claupiece</span>
        </Link>
        <ul className="flex list-none items-center gap-1 p-0">
          {LINKS.map((l) => {
            const attivo = path === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    attivo
                      ? 'bg-white text-[color:var(--accent-strong)] shadow'
                      : 'text-text-mid hover:bg-[rgba(167,139,250,0.14)] hover:text-text-high'
                  }`}
                >
                  <span>{l.emoji}</span>
                  <span>{l.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
