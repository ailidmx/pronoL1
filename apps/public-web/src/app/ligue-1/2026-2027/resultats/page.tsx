import { AdSlot } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchList } from "@/components/football/match-list";
import { createPageMetadata } from "@/lib/seo/metadata";
import { getSeasonOverview } from "@/server/football-repository";

export const metadata = createPageMetadata({ title: "Résultats Ligue 1 2026-2027 : scores et matchs terminés", description: "Tous les derniers résultats de Ligue 1, scores, buteurs, cartons, statistiques et compositions match par match.", path: "/ligue-1/2026-2027/resultats" });
export const dynamic = "force-dynamic";
export default async function ResultsPage() { const data = await getSeasonOverview(2026); const matches = data.matches.filter((match) => match.status === "termine").sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")); return <main className="content"><p className="eyebrow">Scores officiels</p><h1>Résultats Ligue 1 2026-2027</h1><p className="intro">Les matchs terminés, du plus récent au plus ancien. Chaque score mène vers sa fiche détaillée.</p><DataFreshness value={data.updatedAt} /><AdSlot name="results-top" format="leaderboard" /><section className="data-panel related-block"><MatchList matches={matches} /></section><AdSlot name="results-bottom" format="in-feed" /></main>; }
