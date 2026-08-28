import type { Metadata, Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AdSlot } from "@/components/ads/ad-slot";
import { DataFreshness } from "@/components/football/data-freshness";
import { StandingsTable } from "@/components/football/standings-table";
import { createPageMetadata } from "@/lib/seo/metadata";
import { getSeasonOverview, type StandingMode } from "@/server/football-repository";
const modes: Record<string, { key: StandingMode; label: string }> = { general: { key: "general", label: "général" }, domicile: { key: "domicile", label: "à domicile" }, exterieur: { key: "exterieur", label: "à l’extérieur" } };
type Props = { params: Promise<{ mode: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { mode } = await params; const current = modes[mode]; return createPageMetadata({ title: `Classement Ligue 1 ${current?.label ?? ""} 2026-2027`, description: `Classement ${current?.label ?? ""} de Ligue 1 : points, victoires, défaites et différence de buts.`, path: `/ligue-1/2026-2027/classement/${mode}`, noIndex: !current }); }
export const dynamic = "force-dynamic";
export default async function RankingPage({ params }: Props) { const { mode } = await params; if (mode === "extérieur") permanentRedirect("/ligue-1/2026-2027/classement/exterieur" as Route); const current = modes[mode]; if (!current) notFound(); const data = await getSeasonOverview(2026); return <main className="content"><p className="eyebrow">Ligue 1 2026-2027</p><h1>Classement {current.label}</h1><nav className="section-nav"><a href="/ligue-1/2026-2027/classement/general">Général</a><a href="/ligue-1/2026-2027/classement/domicile">Domicile</a><a href="/ligue-1/2026-2027/classement/exterieur">Extérieur</a></nav><DataFreshness value={data.updatedAt} /><AdSlot name={`ranking-${mode}-top`} format="leaderboard" /><section className="data-panel related-block"><StandingsTable rows={data.standingsByMode[current.key]} /></section></main>; }
