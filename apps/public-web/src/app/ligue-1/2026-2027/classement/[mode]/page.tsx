import type { Metadata, Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AdSlot, DesktopAdRail } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { StandingsTable } from "@/components/football/standings-table";
import { createPageMetadata } from "@/lib/seo/metadata";
import { getSeasonOverview, type StandingMode } from "@/server/football-repository";
const modes: Record<string, { key: StandingMode; label: string }> = { general: { key: "general", label: "général" }, domicile: { key: "domicile", label: "à domicile" }, exterieur: { key: "exterieur", label: "à l’extérieur" } };
type Props = { params: Promise<{ mode: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { mode } = await params; const current = modes[mode]; return createPageMetadata({ title: `Classement Ligue 1 ${current?.label ?? ""} 2026-2027`, description: `Classement ${current?.label ?? ""} de Ligue 1 : points, victoires, défaites et différence de buts.`, path: `/ligue-1/2026-2027/classement/${mode}`, noIndex: !current }); }
export const dynamic = "force-dynamic";
export default async function RankingPage({ params }: Props) {
  const { mode } = await params;
  if (mode === "extérieur") permanentRedirect("/ligue-1/2026-2027/classement/exterieur" as Route);
  const current = modes[mode];
  if (!current) notFound();
  const data = await getSeasonOverview(2026);
  return <main className="content">
    <AdSlot name={`ranking-${mode}-masthead`} format="billboard" />
    <DesktopAdRail name={`ranking-${mode}-desktop-rail`} />
    <p className="eyebrow">Ligue 1 2026-2027</p><h1>Classement {current.label}</h1>
    <p className="intro">Le classement de Ligue 1 {current.label} avec les points, matchs joués, victoires, nuls, défaites, buts et différence de buts de chaque club.</p>
    <nav className="section-nav"><a href="/ligue-1/2026-2027/classement/general">Général</a><a href="/ligue-1/2026-2027/classement/domicile">Domicile</a><a href="/ligue-1/2026-2027/classement/exterieur">Extérieur</a></nav><DataFreshness value={data.updatedAt} />
    <section className="data-panel related-block"><StandingsTable rows={data.standingsByMode[current.key]} /></section>
    <AdSlot name={`ranking-${mode}-in-feed`} format="in-feed" />
    <section className="seo-copy"><h2>Comprendre le classement {current.label}</h2><p>Les équipes sont classées selon leur total de points, puis départagées par les critères officiels de la compétition. Les vues domicile et extérieur permettent de comparer les performances selon le lieu du match, tandis que le classement général cumule toute la saison.</p><p>Consulte les <a href="/ligue-1/2026-2027/resultats">derniers résultats de Ligue 1</a> pour comprendre les évolutions du tableau et le <a href="/ligue-1/2026-2027/calendrier">calendrier 2026-2027</a> pour voir les prochaines rencontres.</p></section>
    <AdSlot name={`ranking-${mode}-bottom`} format="leaderboard" />
  </main>;
}
