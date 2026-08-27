import { JsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteConfig.name,
        url: siteConfig.url.toString(),
        inLanguage: "fr-FR",
      }} />
      <section className="hero">
        <p className="eyebrow">Ligue 1 · Saison 2026–2027</p>
        <h1>Les matchs, les chiffres et ton prono.</h1>
        <p>
          Un socle public pour suivre la Ligue 1, comprendre chaque affiche et
          rejoindre le jeu de pronostics.
        </p>
        <div className="actions">
          <a className="primary" href="/ligue-1/2026-2027">Voir la saison</a>
          <a href="/pronostics">Faire un prono</a>
        </div>
      </section>
      <section className="grid" aria-label="Fonctionnalités disponibles">
        <article><h2>Calendrier</h2><p>Chaque journée, chaque match et chaque horaire.</p></article>
        <article><h2>Analyses</h2><p>Forme, confrontations et statistiques utiles.</p></article>
        <article><h2>Pronostics</h2><p>Transforme ton analyse en score et défie la communauté.</p></article>
      </section>
    </>
  );
}
