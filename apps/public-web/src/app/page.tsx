import { AdSlot } from "@/components/ads/ad-slot";
import { MatchList } from "@/components/football/match-list";
import { StandingsTable } from "@/components/football/standings-table";
import { ExperimentConversionTracker } from "@/components/experiments/experiment-conversion-tracker";
import { HomeExperienceHero } from "@/components/experiments/home-experience-hero";
import { PricingComparison } from "@/components/pricing/pricing-comparison";
import { competitions } from "@/config/competitions";
import { siteConfig } from "@/config/site";
import { publicContent } from "@/content/public-content";
import { JsonLd } from "@/lib/seo/json-ld";
import { getSeasonOverview } from "@/server/football-repository";
import { getPublicEntitlementCatalog } from "@/server/entitlements-repository";

export const dynamic = "force-dynamic";

async function loadData() {
  try { return await getSeasonOverview(2026); }
  catch (error) { console.error("Public football data unavailable", error); return null; }
}

export default async function HomePage() {
  const [data, catalog] = await Promise.all([loadData(), getPublicEntitlementCatalog()]);
  const now = Date.now();
  const finished = data?.matches
    .filter((match) => match.status === "termine" || (match.date && new Date(match.date).valueOf() < now))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 6) ?? [];
  const upcoming = data?.matches
    .filter((match) => !match.date || new Date(match.date).valueOf() >= now)
    .slice(0, 6) ?? [];

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteConfig.name,
        url: siteConfig.url.toString(),
        description: siteConfig.description,
        inLanguage: "fr-FR",
      }} />

      <AdSlot name="home-masthead" format="billboard" />
      <ExperimentConversionTracker />
      <HomeExperienceHero matches={data?.matches.length ?? null} clubs={data?.clubs.length ?? null} updatedAt={data?.updatedAt ?? null} />

      <section className="section-shell" id="fonctionnalites" data-experiment-section="features">
        <div className="section-intro"><p className="eyebrow">Une seule destination</p><h2>Le match, sans chercher partout.</h2><p>Chaque donnée importante possède sa propre page, son historique et ses liens vers les clubs, la journée et la compétition.</p></div>
        <div className="feature-grid">{publicContent.featureCards.map((feature, index) => <article key={feature.title}><span>0{index + 1}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
      </section>

      <AdSlot name="home-after-features" format="leaderboard" />

      <section className="section-shell" id="resultats" data-experiment-section="results">
        <div className="section-heading standalone"><div><p className="eyebrow">Ligue 1</p><h2>Derniers résultats</h2></div><a href="/ligue-1/2026-2027">Tous les matchs</a></div>
        <div className="data-grid flush"><div className="data-panel"><MatchList matches={finished} /></div><div className="data-panel"><div className="section-heading"><div><p className="eyebrow">À suivre</p><h2>Prochains matchs</h2></div></div><MatchList matches={upcoming} /></div></div>
      </section>

      <section className="section-shell">
        <div className="section-heading standalone"><div><p className="eyebrow">Classement actualisé</p><h2>Ligue 1 2026–2027</h2></div><a href="/ligue-1/2026-2027">Voir la saison</a></div>
        <div className="data-panel"><StandingsTable rows={data?.standings ?? []} /></div>
      </section>

      <section className="section-shell" id="competitions" data-experiment-section="competitions">
        <div className="section-intro"><p className="eyebrow">Couverture</p><h2>La France aujourd’hui. L’Europe ensuite.</h2><p>Le moteur est conçu pour accueillir plusieurs compétitions sans dupliquer la logique ni créer de pages pauvres.</p></div>
        <div className="competition-grid">{competitions.map((competition) => <article className={competition.status === "live" ? "is-live" : ""} key={competition.id}><span>{competition.shortName}</span><div><h3>{competition.name}</h3><p>{competition.status === "live" ? "Disponible" : "Ouverture planifiée"}</p></div></article>)}</div>
      </section>

      <AdSlot name="home-mid-content" format="in-feed" />

      <section className="section-shell" id="offres" data-experiment-section="pricing">
        <div className="section-intro"><p className="eyebrow">Simple et transparent</p><h2>Commence gratuitement.</h2><p>Les informations essentielles restent accessibles. Les fonctions avancées et le confort sans publicité financent la plateforme.</p></div>
        <PricingComparison plans={catalog.plans} offers={catalog.offers} />
      </section>

      <section className="section-shell prono-cta">
        <p className="eyebrow">Tu penses connaître le score ?</p><h2>Passe des statistiques au terrain.</h2><p>Rejoins Prono L1, pronostique les matchs et compare tes résultats avec tes proches.</p><a className="primary" href="/pronostics" data-experiment-action="open-prono" data-experiment-location="bottom-cta">Découvrir Prono L1</a>
      </section>
      <AdSlot name="home-bottom" format="leaderboard" />
    </>
  );
}
