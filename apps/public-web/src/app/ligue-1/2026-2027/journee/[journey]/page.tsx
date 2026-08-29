import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdSlot, DesktopAdRail } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchList } from "@/components/football/match-list";
import { JourneyPicker } from "@/components/navigation/journey-picker";
import { listAvailableJourneys } from "@/lib/journey-navigation";
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
  const journeys = listAvailableJourneys(data.matches);
  const currentIndex = journeys.indexOf(journey);
  const previousJourney = currentIndex > 0 ? journeys[currentIndex - 1] : null;
  const nextJourney = currentIndex >= 0 && currentIndex < journeys.length - 1 ? journeys[currentIndex + 1] : null;

  return (
    <article className="content compact-content">
      <AdSlot name={`journey-${journey}-masthead`} format="billboard" />
      <DesktopAdRail name={`journey-${journey}-desktop-rail`} />
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>›</span><a href="/ligue-1/2026-2027">Ligue 1</a><span>›</span><span>{journey}e journée</span></nav>
      <p className="eyebrow">Calendrier et résultats</p><h1>{journey}e journée de Ligue 1 2026–2027</h1>
      <p className="intro">Une seule journée à la fois : choisis une autre journée pour ouvrir sa page dédiée, son URL et ses matchs.</p>
      <DataFreshness value={data.updatedAt} />
      <JourneyPicker currentJourney={journey} journeys={journeys} />
      <section className="data-panel"><MatchList matches={matches} /></section>
      <AdSlot name={`journey-${journey}-in-feed`} format="in-feed" />
      <section className="seo-copy"><h2>Matchs et scores de la {journey}e journée</h2><p>Cette page réunit les rencontres de la {journey}e journée de Ligue 1 2026-2027. Chaque affiche donne accès à sa date, son horaire, son score et, lorsqu’elles sont disponibles, ses statistiques, compositions, buteurs, cartons et changements.</p><p>Retrouve également les <a href="/ligue-1/2026-2027/resultats">résultats de Ligue 1</a>, le <a href="/ligue-1/2026-2027/classement/general">classement actualisé</a> et utilise le sélecteur ci-dessus pour naviguer entre les journées indexables.</p></section>
      <nav className="pagination" aria-label="Journées">{previousJourney ? <a href={`/ligue-1/2026-2027/journee/${previousJourney}`}>← Journée {previousJourney}</a> : <span />}{nextJourney ? <a href={`/ligue-1/2026-2027/journee/${nextJourney}`}>Journée {nextJourney} →</a> : null}</nav>
      <AdSlot name={`journey-${journey}-bottom`} format="leaderboard" />
    </article>
  );
}
