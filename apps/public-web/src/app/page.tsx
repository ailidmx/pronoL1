import { AdSlot } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchList } from "@/components/football/match-list";
import { StandingsTable } from "@/components/football/standings-table";
import { competitions } from "@/config/competitions";
import { siteConfig } from "@/config/site";
import { publicContent } from "@/content/public-content";
import { JsonLd } from "@/lib/seo/json-ld";
import { getSeasonOverview } from "@/server/football-repository";
import { formatOfferPrice, getPublicEntitlementCatalog, offerIntervalLabel } from "@/server/entitlements-repository";

export const dynamic = "force-dynamic";

const FEATURE_LABELS: Record<string, string> = {
  scores: "Scores et résultats",
  calendar: "Calendrier",
  standings: "Classements",
  analyses: "Analyses de match",
  favorites: "Favoris",
  history: "Historique",
  matchAlerts: "Alertes matchs",
  advancedStatistics: "Statistiques avancées",
  adFree: "Sans publicité",
  pronoAdvantages: "Avantages Prono L1",
};

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
  const planById = new Map(catalog.plans.map((plan) => [plan.id, plan]));
  const freePlans = catalog.plans.filter((plan) => plan.isPaid !== true);

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

      <section className="hero landing-hero">
        <div>
          <p className="eyebrow">{publicContent.hero.eyebrow}</p>
          <h1>{publicContent.hero.title}</h1>
          <p>{publicContent.hero.description}</p>
          <div className="actions"><a className="primary" href="#resultats">Voir les derniers résultats</a><a href="#offres">Découvrir les offres</a></div>
          <div className="trust-row"><span>Actualisation régulière</span><span>Pages sans inscription</span><span>Sources API normalisées</span></div>
        </div>
        <aside className="hero-score-card" aria-label="Aperçu des données">
          <span className="live-pill">Données en direct</span>
          <strong>{data?.matches.length ?? "—"}</strong><span>matchs référencés</span>
          <strong>{data?.clubs.length ?? "—"}</strong><span>clubs suivis</span>
          <DataFreshness value={data?.updatedAt ?? null} compact />
        </aside>
      </section>

      <section className="section-shell" id="fonctionnalites">
        <div className="section-intro"><p className="eyebrow">Une seule destination</p><h2>Le match, sans chercher partout.</h2><p>Chaque donnée importante possède sa propre page, son historique et ses liens vers les clubs, la journée et la compétition.</p></div>
        <div className="feature-grid">{publicContent.featureCards.map((feature, index) => <article key={feature.title}><span>0{index + 1}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
      </section>

      <AdSlot name="home-top" format="leaderboard" />

      <section className="section-shell" id="resultats">
        <div className="section-heading standalone"><div><p className="eyebrow">Ligue 1</p><h2>Derniers résultats</h2></div><a href="/ligue-1/2026-2027">Tous les matchs</a></div>
        <div className="data-grid flush"><div className="data-panel"><MatchList matches={finished} /></div><div className="data-panel"><div className="section-heading"><div><p className="eyebrow">À suivre</p><h2>Prochains matchs</h2></div></div><MatchList matches={upcoming} /></div></div>
      </section>

      <section className="section-shell">
        <div className="section-heading standalone"><div><p className="eyebrow">Classement actualisé</p><h2>Ligue 1 2026–2027</h2></div><a href="/ligue-1/2026-2027">Voir la saison</a></div>
        <div className="data-panel"><StandingsTable rows={data?.standings ?? []} /></div>
      </section>

      <section className="section-shell" id="competitions">
        <div className="section-intro"><p className="eyebrow">Couverture</p><h2>La France aujourd’hui. L’Europe ensuite.</h2><p>Le moteur est conçu pour accueillir plusieurs compétitions sans dupliquer la logique ni créer de pages pauvres.</p></div>
        <div className="competition-grid">{competitions.map((competition) => <article className={competition.status === "live" ? "is-live" : ""} key={competition.id}><span>{competition.shortName}</span><div><h3>{competition.name}</h3><p>{competition.status === "live" ? "Disponible" : "Ouverture planifiée"}</p></div></article>)}</div>
      </section>

      <section className="section-shell" id="offres">
        <div className="section-intro"><p className="eyebrow">Simple et transparent</p><h2>Commence gratuitement.</h2><p>Les informations essentielles restent accessibles. Les fonctions avancées et le confort sans publicité financent la plateforme.</p></div>
        <div className="pricing-grid">
          {freePlans.map((plan) => <article key={plan.id}><h3>{plan.name}</h3><strong>0 €</strong><ul>{Object.entries(plan.features ?? {}).filter(([, enabled]) => enabled).slice(0, 5).map(([key]) => <li key={key}>{FEATURE_LABELS[key] ?? key}</li>)}</ul><a href={plan.id === "public" ? "/ligue-1/2026-2027" : "/connexion"}>Commencer</a></article>)}
          {catalog.offers.map((offer) => {
            const plan = planById.get(offer.accessPlanId);
            return <article className={offer.featured ? "featured" : ""} key={offer.id}>{offer.badge ? <span className="popular">{offer.badge}</span> : null}<h3>{offer.name}</h3><strong>{formatOfferPrice(offer)} <small>{offerIntervalLabel(offer)}</small></strong><ul>{Object.entries(plan?.features ?? {}).filter(([, enabled]) => enabled).slice(0, 6).map(([key]) => <li key={key}>{FEATURE_LABELS[key] ?? key}</li>)}</ul><a href="/pronostics">Choisir cette offre</a></article>;
          })}
        </div>
      </section>

      <section className="section-shell prono-cta">
        <p className="eyebrow">Tu penses connaître le score ?</p><h2>Passe des statistiques au terrain.</h2><p>Rejoins Prono L1, pronostique les matchs et compare tes résultats avec tes proches.</p><a className="primary" href="/pronostics">Découvrir Prono L1</a>
      </section>
      <AdSlot name="home-bottom" format="leaderboard" />
    </>
  );
}
