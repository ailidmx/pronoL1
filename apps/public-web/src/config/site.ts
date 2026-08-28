const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? "Stat de Foot",
  title: "Stat de Foot — Scores, statistiques et analyses football",
  description:
    "Scores, résultats, compositions, classements, statistiques et confrontations pour suivre le football en détail.",
  locale: "fr_FR",
  language: "fr",
  url: new URL(configuredUrl),
} as const;
