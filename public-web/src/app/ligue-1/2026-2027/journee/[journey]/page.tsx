import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchList } from "@/components/football/match-list";
import { createPageMetadata } from "@/lib/seo/metadata";
import { getSeasonOverview } from "@/server/football-repository";

type Props = { params: Promise<{ journey: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const journey = Number((await params).journey);
  return createPageMetadata({ title: `${journey}e journée de Ligue 1 2026-2027 : matchs et résultats`, description: `Calendrier, scores et résultats complets de la ${journey}e journée de Ligue 1 2026-2027.`, path: `/ligue-1/2026-2027/journee/${journey}`, noIndex: !Number.isInteger(journey) || journey < 1 || journey > 34 });
}

export const dynamic = "force-dynamic";

export default async function JourneyPage({ params }: Props) {
  const journey = Number((await params).journey);
  if (!Number.isInteger(journey) || journey < 1 || journey > 34) notFound();
  const data = await getSeasonOverview(2026);
  const matches = data.matches.filter((match) => match.journey === journey);
  if (matches.length === 0) notFound();
  return (
    <article className="content compact-content">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>›</span><a href="/ligue-1/2026-2027">Ligue 1</a><span>›</span><span>{journey}e journée</span></nav>
      <p className="eyebrow">Calendrier et résultats</p><h1>{journey}e journée de Ligue 1 2026–2027</h1>
      <p className="intro">Les dix affiches de la journée, leurs horaires, scores et fiches détaillées.</p><DataFreshness value={data.updatedAt} />
      <AdSlot name="journey-top" format="leaderboard" />
      <section className="data-panel"><MatchList matches={matches} /></section>
      <nav className="pagination" aria-label="Journées">{journey > 1 ? <a href={`/ligue-1/2026-2027/journee/${journey - 1}`}>← Journée précédente</a> : <span />}{journey < 34 ? <a href={`/ligue-1/2026-2027/journee/${journey + 1}`}>Journée suivante →</a> : null}</nav>
    </article>
  );
}
