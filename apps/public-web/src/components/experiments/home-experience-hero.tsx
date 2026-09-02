import { DataFreshness } from "@/components/football/data-freshness";

type Props = { matches: number | null; clubs: number | null; updatedAt: string | null };

export function HomeExperienceHero({ matches, clubs, updatedAt }: Props) {
  const totalMatches = matches ?? "—";
  const totalClubs = clubs ?? "—";

  return (
    <section className="home-experience-heroes" data-experiment-section="hero">
      <article className="home-experience home-experience-data">
        <div className="home-experience-copy">
          <p className="eyebrow">Modern Data Lab</p>
          <h1>Le football passe au diagnostic.</h1>
          <p>Scores, xG, forme et tendances réunis dans un laboratoire de données lisible, précis et actionnable.</p>
          <div className="actions">
            <a className="primary" href="#resultats" data-experiment-action="launch-analysis" data-experiment-location="hero">Lancer une analyse</a>
            <a href="#competitions" data-experiment-action="browse-competitions" data-experiment-location="hero">Explorer les données</a>
          </div>
          <div className="trust-row"><span>Sources normalisées</span><span>Analyses documentées</span><span>Données actualisées</span></div>
        </div>
        <aside className="experience-dashboard" aria-label="Aperçu du laboratoire de données">
          <div className="dashboard-heading"><span>Indice DocFoot</span><strong>86,4</strong></div>
          <div className="radar-preview" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <div className="dashboard-metrics"><span><strong>{totalMatches}</strong> matchs</span><span><strong>{totalClubs}</strong> clubs</span></div>
          <DataFreshness value={updatedAt} compact />
        </aside>
      </article>

      <article className="home-experience home-experience-live">
        <div className="home-experience-copy">
          <p className="eyebrow"><span className="live-beacon" /> Match Day Live</p>
          <h1>Prends le pouls du match.</h1>
          <p>Le direct, les moments clés et les statistiques qui expliquent ce qui se passe maintenant sur le terrain.</p>
          <div className="actions">
            <a className="primary" href="#resultats" data-experiment-action="follow-live" data-experiment-location="hero">Suivre le direct</a>
            <a href="/pronostics" data-experiment-action="flash-prediction" data-experiment-location="hero">Pronostic flash</a>
          </div>
        </div>
        <aside className="live-match-card" aria-label="Aperçu match en direct">
          <div><span className="live-beacon" /> LIVE <time>78&apos;</time></div>
          <p><strong>Paris SG</strong><b>2 — 1</b><strong>Marseille</strong></p>
          <svg viewBox="0 0 420 68" role="img" aria-label="Rythme du match"><polyline points="0,36 55,36 70,15 90,55 110,6 130,42 155,42 170,26 185,48 205,18 220,36 275,36 290,12 310,54 330,22 348,36 420,36" /></svg>
          <div className="intensity"><span>Intensité</span><i><b /></i><strong>84%</strong></div>
          <small>{totalMatches} matchs couverts cette saison</small>
        </aside>
      </article>

      <article className="home-experience home-experience-editorial">
        <div className="home-experience-copy">
          <p className="eyebrow">L’encyclopédie vivante du football</p>
          <h1>Comprendre le jeu. Conserver sa mémoire.</h1>
          <p>Grands récits, tactiques, archives et données : la référence qui relie chaque match à l’histoire du football.</p>
          <div className="actions">
            <a className="primary" href="#fonctionnalites" data-experiment-action="read-feature" data-experiment-location="hero">Lire le dossier</a>
            <a href="#resultats" data-experiment-action="open-archives" data-experiment-location="hero">Consulter les archives</a>
          </div>
          <div className="reading-note"><span>À la une</span><strong>Comment les données ont changé la lecture d’un match</strong><small>7 min de lecture</small></div>
        </div>
        <aside className="editorial-cover" aria-label="Dossier DocFoot à la une">
          <span>Le dossier du Doc</span>
          <strong>Les grandes tactiques qui ont façonné le football moderne</strong>
          <small>Archives · Analyse · Histoire</small>
        </aside>
      </article>
    </section>
  );
}
