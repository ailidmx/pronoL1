import { JsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/config/site";
import { AdSlot } from "@/components/ads/ad-slot";
import { MatchList } from "@/components/football/match-list";
import { StandingsTable } from "@/components/football/standings-table";
import { getSeasonOverview } from "@/server/football-repository";

export const dynamic = "force-dynamic";

async function loadData() {
  try { return await getSeasonOverview(2026); }
  catch (error) { console.error("Public football data unavailable", error); return null; }
}

export default async function HomePage() {
  const data = await loadData();
  const now = Date.now();
  const upcoming = data?.matches.filter((match) => !match.date || new Date(match.date).valueOf() >= now).slice(0, 6) ?? [];
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
      <AdSlot name="home-top" format="leaderboard" />
      <section className="data-grid">
        <div className="data-panel">
          <div className="section-heading"><div><p className="eyebrow">Prochainement</p><h2>Les prochains matchs</h2></div><a href="/ligue-1/2026-2027">Tout le calendrier</a></div>
          {data ? <MatchList matches={upcoming} /> : <p className="empty-state">Connexion aux données momentanément indisponible.</p>}
        </div>
        <div className="data-panel">
          <div className="section-heading"><div><p className="eyebrow">Classement</p><h2>Ligue 1</h2></div></div>
          {data ? <StandingsTable rows={data.standings} /> : <p className="empty-state">Classement momentanément indisponible.</p>}
        </div>
      </section>
      <AdSlot name="home-bottom" format="rectangle" />
    </>
  );
}
