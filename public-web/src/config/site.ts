const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: "Prono L1",
  title: "Prono L1 — Matchs, statistiques et pronostics Ligue 1",
  description:
    "Calendrier, scores, statistiques, confrontations et pronostics pour tous les matchs de Ligue 1.",
  locale: "fr_FR",
  language: "fr",
  url: new URL(configuredUrl),
} as const;
