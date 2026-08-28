import type { Metadata, Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AdSlot } from "@/components/ads/ad-slot";
import { ClubMark } from "@/components/football/club-mark";
import { DataFreshness } from "@/components/football/data-freshness";
import { MatchList } from "@/components/football/match-list";
import { slugify } from "@/lib/slug";
import { createPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/lib/seo/json-ld";
import { getClubById } from "@/server/football-repository";

type Props = { params: Promise<{ id: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getClubById(2026, id);
  if (!data) return createPageMetadata({ title: "Club introuvable", description: "Cette page club n’est pas disponible.", path: `/club/${id}`, noIndex: true });
  return createPageMetadata({ title: `${data.club.name} : derniers résultats, matchs et classement`, description: `Retrouve les derniers résultats, les prochains matchs, le classement et les statistiques de ${data.club.name}.`, path: `/club/${id}/${slugify(data.club.name)}` });
}

export const dynamic = "force-dynamic";

export default async function ClubPage({ params }: Props) {
  const { id, slug } = await params;
  const data = await getClubById(2026, id);
  if (!data) notFound();
  const expectedSlug = slugify(data.club.name);
  if (slug !== expectedSlug) permanentRedirect(`/club/${id}/${expectedSlug}` as Route);
  const now = Date.now();
  const latest = data.matches.filter((match) => match.date && new Date(match.date).valueOf() < now).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 10);
  const upcoming = data.matches.filter((match) => !match.date || new Date(match.date).valueOf() >= now).slice(0, 10);

  return (
    <article className="content club-page">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SportsTeam", name: data.club.name, sport: "Football", logo: data.club.logoUrl ?? undefined }} />
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>›</span><a href="/ligue-1/2026-2027">Ligue 1</a><span>›</span><span>{data.club.name}</span></nav>
      <p className="eyebrow">Club · Ligue 1 2026–2027</p><h1>{data.club.name}</h1>
      <div className="club-summary"><ClubMark club={data.club} linked={false} />{data.standing ? <p><strong>{data.standing.rank}<sup>e</sup></strong> au classement · {data.standing.points} points · différence {data.standing.difference > 0 ? `+${data.standing.difference}` : data.standing.difference}</p> : <p>Classement à actualiser</p>}</div>
      <DataFreshness value={data.updatedAt} />
      <AdSlot name="club-top" format="leaderboard" />
      <div className="match-content-grid"><section className="data-panel"><div className="section-heading"><div><p className="eyebrow">Forme récente</p><h2>Derniers résultats</h2></div></div><MatchList matches={latest} /></section><section className="data-panel"><div className="section-heading"><div><p className="eyebrow">Calendrier</p><h2>Prochains matchs</h2></div></div><MatchList matches={upcoming} /></section></div>
    </article>
  );
}
