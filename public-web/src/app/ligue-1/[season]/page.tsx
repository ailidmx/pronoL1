import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/lib/seo/json-ld";
import { AdSlot } from "@/components/ads/ad-slot";
import { MatchList } from "@/components/football/match-list";
import { StandingsTable } from "@/components/football/standings-table";
import { DataFreshness } from "@/components/football/data-freshness";
import { getSeasonOverview, type FootballMatch } from "@/server/football-repository";

type Props = { params: Promise<{ season: string }> };
const supportedSeasons = new Set(["2026-2027"]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { season } = await params;
  return createPageMetadata({
    title: `Ligue 1 ${season} : calendrier, résultats et classement`,
    description: `Retrouve le calendrier, les résultats, le classement et les statistiques de la Ligue 1 ${season}.`,
    path: `/ligue-1/${season}`,
    noIndex: !supportedSeasons.has(season),
  });
}

export const dynamic = "force-dynamic";

export default async function SeasonPage({ params }: Props) {
  const { season } = await params;
  if (!supportedSeasons.has(season)) notFound();
  let data = null;
  try { data = await getSeasonOverview(2026); }
  catch (error) { console.error("Season data unavailable", error); }
  const journeys = new Map<number, FootballMatch[]>();
  for (const match of data?.matches ?? []) {
    const journey = match.journey ?? 0;
    journeys.set(journey, [...(journeys.get(journey) ?? []), match]);
  }

  return (
    <article className="content">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: `Championnat de France de Ligue 1 ${season}`,
        description: `Calendrier et résultats de la Ligue 1 ${season}`,
      }} />
      <p className="eyebrow">Championnat de France</p>
      <h1>Ligue 1 {season}</h1>
      <p className="intro">Calendrier, résultats et classement alimentés par les données synchronisées de Prono L1.</p>
      <nav className="section-nav"><a href="/ligue-1/2026-2027/resultats">Derniers résultats</a><a href="/ligue-1/2026-2027/calendrier">Calendrier complet</a><a href="/ligue-1/2026-2027/classement/general">Classement général</a><a href="/ligue-1/2026-2027/classement/domicile">Classement domicile</a><a href="/ligue-1/2026-2027/classement/exterieur">Classement extérieur</a></nav>
      <DataFreshness value={data?.updatedAt ?? null} />
      <AdSlot name="season-top" format="leaderboard" />
      <section className="season-layout">
        <div className="data-panel"><div className="section-heading"><div><p className="eyebrow">Tableau complet</p><h2>Classement</h2></div></div><StandingsTable rows={data?.standings ?? []} /></div>
        <div className="journeys">
          {[...journeys.entries()].sort(([a], [b]) => a - b).map(([journey, matches], index) => (
            <div key={journey}>
              {index === 3 ? <AdSlot name="season-in-feed-1" format="in-feed" /> : null}
              <section className="data-panel journey"><div className="section-heading"><div><p className="eyebrow">Calendrier</p><h2>{journey ? `${journey}e journée` : "Matchs à programmer"}</h2></div>{journey ? <a href={`/ligue-1/${season}/journee/${journey}`}>Page de la journée</a> : null}</div><MatchList matches={matches} /></section>
            </div>
          ))}
          {journeys.size === 0 ? <p className="empty-state">Les matchs ne sont pas encore disponibles.</p> : null}
        </div>
      </section>
    </article>
  );
}
