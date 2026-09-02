import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo/metadata";
import { PLAYER_APP_URL } from "@/config/app-links";

export const metadata: Metadata = createPageMetadata({
  title: "Prono L1 : le jeu de pronostics entre amis",
  description: "Pronostique les scores de Ligue 1, marque des points et défie tes proches dans Prono L1.",
  path: "/pronostics",
});

export default function PronosticsPage() {
  return (
    <article className="content promo-page">
      <p className="eyebrow">L’application privée</p>
      <h1>Tes pronostics. Ton classement. Ta communauté.</h1>
      <p className="intro">Prono L1 transforme chaque journée de championnat en compétition entre amis : scores exacts, bonus, quiz et classements.</p>
      <div className="feature-grid"><article><span>01</span><h2>Pronostique</h2><p>Choisis le score de chaque match avant le coup d’envoi.</p></article><article><span>02</span><h2>Marque des points</h2><p>Résultat correct, score exact et bonus font la différence.</p></article><article><span>03</span><h2>Défie tes proches</h2><p>Compare tes performances journée après journée.</p></article></div>
      <div className="actions"><a className="primary" href={PLAYER_APP_URL}>Ouvrir Prono L1</a><a href="/">Retour aux statistiques</a></div>
    </article>
  );
}
