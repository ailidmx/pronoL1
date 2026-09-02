import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";
import { GoogleTags } from "@/components/analytics/google-tags";
import { ConsentBanner, PrivacySettingsButton } from "@/components/privacy/consent-banner";
import { DataFreshness } from "@/components/football/data-freshness";
import { getSeasonOverview } from "@/server/football-repository";
import { AuthProvider } from "@/lib/client/auth";
import { ExperimentBootstrap } from "@/components/experiments/experiment-bootstrap";
import { DocfootExperienceHeader } from "@/components/experiments/docfoot-experience-header";
import { BrowserTimezone } from "@/components/system/browser-timezone";
import "./global.scss";
import "./navigation.scss";
import "./experiment-themes.scss";
import "./pwa-menu.scss";

const adsensePublisherId = "ca-pub-9809524492306432";

export const metadata: Metadata = {
  metadataBase: siteConfig.url,
  title: { default: siteConfig.title, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  category: "sports",
  creator: siteConfig.name,
  publisher: siteConfig.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DocFoot" },
  icons: { icon: "/app-icon.svg", apple: "/app-icon-192.png" },
  formatDetection: { email: false, address: false, telephone: false },
  other: { "google-adsense-account": adsensePublisherId },
};

export const viewport: Viewport = { themeColor: "#0b0e13", colorScheme: "dark" };

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  let updatedAt: string | null = null;
  try { updatedAt = (await getSeasonOverview(2026)).updatedAt; }
  catch (error) { console.error("Data freshness unavailable", error); }
  const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";
  return (
    <html lang={siteConfig.language} suppressHydrationWarning>
      <body>
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsensePublisherId}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <ExperimentBootstrap />
        <BrowserTimezone />
        <AuthProvider>
        <GoogleTags />
        <DocfootExperienceHeader />
        <main>{children}</main>
        <footer>
          <div><strong>{siteConfig.name}</strong><span>Site indépendant, non affilié aux compétitions citées.</span></div>
          <DataFreshness value={updatedAt} compact />
          <div className="footer-links"><a href="/ligue-1/2026-2027/resultats">Résultats Ligue 1</a><a href="/ligue-1/2026-2027/calendrier">Calendrier</a><a href="/pronostics">Prono L1</a><PrivacySettingsButton /></div>
          <div className="app-build-version" title="Version de build UTC">v{buildVersion}</div>
        </footer>
        <ConsentBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
