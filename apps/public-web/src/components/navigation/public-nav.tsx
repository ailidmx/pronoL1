"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: Array<{ href: string; label: string; isActive: (pathname: string) => boolean }> = [
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
];

export function PublicNav() {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link key={item.href} href={item.href as Route} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
