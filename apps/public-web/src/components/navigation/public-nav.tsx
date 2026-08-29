"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<{ href: Route; label: string; isActive: (pathname: string) => boolean }> = [
  {
    href: "/ligue-1/2026-2027/resultats",
    label: "Résultats",
    isActive: (pathname) => pathname === "/ligue-1/2026-2027/resultats",
  },
  {
    href: "/ligue-1/2026-2027/calendrier",
    label: "Calendrier",
    isActive: (pathname) => pathname === "/ligue-1/2026-2027/calendrier" || pathname.startsWith("/ligue-1/2026-2027/journee/"),
  },
  {
    href: "/ligue-1/2026-2027/classement/general",
    label: "Classement",
    isActive: (pathname) => pathname.startsWith("/ligue-1/2026-2027/classement/"),
  },
  {
    href: "/pronostics",
    label: "Pronostics",
    isActive: (pathname) => pathname === "/pronostics",
  },
  {
    href: "/favoris",
    label: "Favoris",
    isActive: (pathname) => pathname === "/favoris",
  },
  {
    href: "/historique",
    label: "Historique",
    isActive: (pathname) => pathname === "/historique",
  },
];

export function PublicNav() {
  const pathname = usePathname();

  return (
    <>
      {items.slice(0, 3).map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link key={item.href} href={item.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
      <a href="/#offres">Offres</a>
      {items.slice(3).map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link key={item.href} href={item.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
