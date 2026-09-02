const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? "DocFoot.fr",
  title: "DocFoot.fr — Le diagnostic complet du football",
  description:
    "Scores, résultats, compositions, classements, statistiques et diagnostics experts pour comprendre le football en détail.",
  locale: "fr_FR",
  language: "fr",
  url: new URL(configuredUrl),
} as const;
