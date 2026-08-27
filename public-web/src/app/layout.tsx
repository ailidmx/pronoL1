import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";
import { GoogleTags } from "@/components/analytics/google-tags";
import { ConsentBanner, PrivacySettingsButton } from "@/components/privacy/consent-banner";
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={siteConfig.language}>
      <body>
        <GoogleTags />
        <header className="site-header">
          <a href="/" className="brand">Prono L1</a>
          <nav aria-label="Navigation principale">
            <a href="/ligue-1/2026-2027">Ligue 1</a>
            <a href="/pronostics">Pronostics</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <span>Prono L1 — site indépendant, non affilié à la Ligue 1.</span>
          <PrivacySettingsButton />
        </footer>
        <ConsentBanner />
      </body>
    </html>
  );
}
