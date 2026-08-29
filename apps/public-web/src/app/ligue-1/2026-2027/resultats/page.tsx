import { AdSlot, DesktopAdRail } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchList } from "@/components/football/match-list";
import { createPageMetadata } from "@/lib/seo/metadata";
import { getSeasonOverview } from "@/server/football-repository";

export const metadata = createPageMetadata({ title: "Résultats Ligue 1 2026-2027 : scores et matchs terminés", description: "Tous les derniers résultats de Ligue 1, scores, buteurs, cartons, statistiques et compositions match par match.", path: "/ligue-1/2026-2027/resultats" });
export const dynamic = "force-dynamic";
export default async function ResultsPage() {
  const data = await getSeasonOverview(2026);
  const matches = data.matches.filter((match) => match.status === "termine").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const recentMatches = matches.slice(0, 10);
  const olderMatches = matches.slice(10);
  return (
    <main className="content">
      <AdSlot name="results-masthead" format="billboard" />
      <DesktopAdRail name="results-desktop-rail" />
      <p className="eyebrow">Scores officiels</p><h1>Résultats Ligue 1 2026-2027</h1>
      <p className="intro">Retrouve les derniers scores de Ligue 1, les résultats par journée et les fiches détaillées avec statistiques, compositions, buteurs et faits de jeu.</p>
      <DataFreshness value={data.updatedAt} />
      <section className="data-panel related-block" aria-labelledby="derniers-resultats"><h2 id="derniers-resultats">Derniers résultats de Ligue 1</h2><MatchList matches={recentMatches} /></section>
      {olderMatches.length ? <><AdSlot name="results-in-feed" format="in-feed" /><section className="data-panel related-block" aria-labelledby="tous-resultats"><h2 id="tous-resultats">Tous les scores de la saison 2026-2027</h2><MatchList matches={olderMatches} /></section></> : null}
      <section className="seo-copy"><h2>Suivre les scores et matchs terminés</h2><p>Cette page rassemble les résultats officiels de la saison, du match le plus récent au plus ancien. Ouvre une rencontre pour consulter le score, la chronologie des buts et cartons, les statistiques, les compositions et les confrontations entre les deux clubs.</p><p>Pour préparer les prochaines affiches, consulte aussi le <a href="/ligue-1/2026-2027/calendrier">calendrier complet de Ligue 1</a> et le <a href="/ligue-1/2026-2027/classement/general">classement général actualisé</a>.</p></section>
      <AdSlot name="results-bottom" format="leaderboard" />
    </main>
  );
}
