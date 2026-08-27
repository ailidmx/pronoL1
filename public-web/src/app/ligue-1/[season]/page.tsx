import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/lib/seo/json-ld";

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

export function generateStaticParams() {
  return [...supportedSeasons].map((season) => ({ season }));
}

export default async function SeasonPage({ params }: Props) {
  const { season } = await params;
  if (!supportedSeasons.has(season)) notFound();

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
      <p>Cette route valide le modèle de page saison. Les données Firestore seront branchées dans une PR dédiée.</p>
      <section className="placeholder" aria-label="Emplacement calendrier">
        Calendrier et classement à connecter
      </section>
    </article>
  );
}
