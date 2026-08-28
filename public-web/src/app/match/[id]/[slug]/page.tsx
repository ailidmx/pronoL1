import type { Metadata, Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AdSlot } from "@/components/ads/ad-slot";
import { ClubMark } from "@/components/football/club-mark";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchLineups } from "@/components/football/match-lineups";
import { MatchList } from "@/components/football/match-list";
import { MatchTimeline } from "@/components/football/match-timeline";
import { MatchStatistics } from "@/components/football/match-statistics";
import { TeamForm } from "@/components/football/team-form";
import { formatMatchDate, matchScore, matchStatusLabel } from "@/lib/football-format";
import { slugify } from "@/lib/slug";
import { createPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/lib/seo/json-ld";
import { getHeadToHead, getMatchById, getSeasonOverview } from "@/server/football-repository";

type Props = { params: Promise<{ id: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = await getMatchById(2026, id);
  if (!match) return createPageMetadata({ title: "Match introuvable", description: "Cette fiche match n’est pas disponible.", path: `/match/${id}`, noIndex: true });
  const title = `${match.homeClub.name} - ${match.awayClub.name} : score, résultat et compositions`;
  return createPageMetadata({ title, description: `${matchScore(match)} : résultat, faits de jeu, compositions et confrontations pour ${match.homeClub.name} - ${match.awayClub.name}.`, path: `/match/${id}/${slugify(`${match.homeClub.name}-${match.awayClub.name}`)}` });
}

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: Props) {
  const { id, slug } = await params;
  const match = await getMatchById(2026, id);
  if (!match) notFound();
  const expectedSlug = slugify(`${match.homeClub.name}-${match.awayClub.name}`);
  if (slug !== expectedSlug) permanentRedirect(`/match/${id}/${expectedSlug}` as Route);
  const headToHead = (await getHeadToHead(2026, match.homeClub.id, match.awayClub.id))
    .filter((candidate) => candidate.id !== match.id)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 5);
  const overview = await getSeasonOverview(2026);

  return (
    <article className="content match-page">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SportsEvent", name: `${match.homeClub.name} - ${match.awayClub.name}`, startDate: match.date ?? undefined, eventStatus: match.status === "termine" ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled", homeTeam: { "@type": "SportsTeam", name: match.homeClub.name }, awayTeam: { "@type": "SportsTeam", name: match.awayClub.name } }} />
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>›</span><a href="/ligue-1/2026-2027">Ligue 1</a><span>›</span><span>{match.homeClub.name} - {match.awayClub.name}</span></nav>
      <p className="eyebrow">Ligue 1 · {matchStatusLabel(match.status)}</p>
      <h1>{match.homeClub.name} - {match.awayClub.name}</h1>
      <div className="match-score-hero"><ClubMark club={match.homeClub} /><strong>{matchScore(match)}</strong><ClubMark club={match.awayClub} /></div>
      <p className="match-date"><time dateTime={match.date ?? undefined}>{formatMatchDate(match.date)}</time></p>
      {match.venue || match.referee ? <p className="match-context">{[match.venue, match.city, match.referee ? `Arbitre : ${match.referee}` : null].filter(Boolean).join(" · ")}</p> : null}
      <DataFreshness value={match.updatedAt} />
      <nav className="section-nav" aria-label="Détails du match"><a href="#resume">Résumé</a><a href="#statistiques">Statistiques</a><a href="#compositions">Compositions</a><a href="#forme">Forme</a><a href="#confrontations">Confrontations</a></nav>
      <AdSlot name="match-top" format="leaderboard" />
      <div className="match-content-grid" id="resume">
        <section className="data-panel"><div className="section-heading"><div><p className="eyebrow">Minute par minute</p><h2>Buts, cartons et changements</h2></div></div><MatchTimeline match={match} /></section>
        <section className="data-panel" id="statistiques"><div className="section-heading"><div><p className="eyebrow">Comparatif</p><h2>Statistiques du match</h2></div></div><MatchStatistics match={match} /></section>
      </div>
      <section className="data-panel related-block" id="compositions"><div className="section-heading"><div><p className="eyebrow">Titulaires et banc</p><h2>Compositions complètes</h2></div></div><MatchLineups match={match} /></section>
      <section className="related-block" id="forme"><div className="section-heading"><div><p className="eyebrow">Avant-match</p><h2>Forme récente : général, domicile et extérieur</h2></div></div><div className="form-team-grid"><div className="data-panel"><h3>{match.homeClub.name}</h3><h4>5 derniers matchs</h4><TeamForm club={match.homeClub} matches={overview.matches} /><h4>À domicile</h4><TeamForm club={match.homeClub} matches={overview.matches} venue="home" /></div><div className="data-panel"><h3>{match.awayClub.name}</h3><h4>5 derniers matchs</h4><TeamForm club={match.awayClub} matches={overview.matches} /><h4>À l’extérieur</h4><TeamForm club={match.awayClub} matches={overview.matches} venue="away" /></div></div></section>
      <section className="data-panel related-block" id="confrontations"><div className="section-heading"><div><p className="eyebrow">Face-à-face</p><h2>Dernières confrontations</h2></div></div><MatchList matches={headToHead} /></section>
      <AdSlot name="match-bottom" format="in-feed" />
    </article>
  );
}
