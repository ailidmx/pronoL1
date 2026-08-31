"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  {
    href: "/pronostics",
    label: "Pronostics",
    isActive: (pathname) => pathname === "/pronostics",
  },
];

export function PublicNav() {
  const pathname = usePathname();
  const [offersActive, setOffersActive] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setOffersActive(false);
      return;
    }
    const section = document.getElementById("offres");
    if (!section) return;
    const syncHash = () => setOffersActive(window.location.hash === "#offres");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    const observer = new IntersectionObserver(([entry]) => setOffersActive(entry.isIntersecting), {
      rootMargin: "-20% 0px -55% 0px",
      threshold: 0,
    });
    observer.observe(section);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", syncHash);
    };
  }, [pathname]);

  return (
    <>
      {items.slice(0, 3).map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link key={item.href} href={item.href as Route} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
      <a href="/#offres" className={offersActive ? "is-active" : undefined} aria-current={offersActive ? "location" : undefined}>Offres</a>
      {items.slice(3).map((item) => {
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
