import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";
import { GoogleTags } from "@/components/analytics/google-tags";
import { ConsentBanner, PrivacySettingsButton } from "@/components/privacy/consent-banner";
import { DataFreshness } from "@/components/football/data-freshness";
import { getSeasonOverview } from "@/server/football-repository";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: siteConfig.url,
  title: { default: siteConfig.title, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  category: "sports",
  creator: siteConfig.name,
  publisher: siteConfig.name,
  formatDetection: { email: false, address: false, telephone: false },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  let updatedAt: string | null = null;
  try { updatedAt = (await getSeasonOverview(2026)).updatedAt; }
  catch (error) { console.error("Data freshness unavailable", error); }
  return (
    <html lang={siteConfig.language}>
      <body>
        <GoogleTags />
        <header className="site-header">
          <a href="/" className="brand">{siteConfig.name}</a>
          <nav aria-label="Navigation principale">
            <a href="/ligue-1/2026-2027/resultats">Résultats</a>
            <a href="/ligue-1/2026-2027/calendrier">Calendrier</a>
            <a href="/ligue-1/2026-2027/classement/general">Classement</a>
            <a href="/#offres">Offres</a>
            <a href="/pronostics">Pronostics</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <div><strong>{siteConfig.name}</strong><span>Site indépendant, non affilié aux compétitions citées.</span></div>
          <DataFreshness value={updatedAt} compact />
          <div className="footer-links"><a href="/ligue-1/2026-2027/resultats">Résultats Ligue 1</a><a href="/ligue-1/2026-2027/calendrier">Calendrier</a><a href="/pronostics">Prono L1</a><PrivacySettingsButton /></div>
        </footer>
        <ConsentBanner />
      </body>
    </html>
  );
}
