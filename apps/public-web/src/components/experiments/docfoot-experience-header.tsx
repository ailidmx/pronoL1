import { AuthButton } from "@/components/auth/auth-button";
import { CompetitionSelector } from "@/components/navigation/competition-selector";
import { PublicNav } from "@/components/navigation/public-nav";
import { InstallApp } from "@/components/pwa/install-app";

const experiences = [
  {
    key: "data-lab",
    letter: "A",
    logo: "/experiences/docfoot-data-lab.jpg",
    title: "DOCFOOT.FR",
    subtitle: "L’analyse & la sagesse du football",
  },
  {
    key: "match-day",
    letter: "B",
    logo: "/experiences/docfoot-match-day.jpg",
    title: "DOCFOOT.FR",
    subtitle: "Le diagnostic du jeu en temps réel",
  },
  {
    key: "encyclopedia",
    letter: "C",
    logo: "/experiences/docfoot-encyclopedia.jpg",
    title: "DOCFOOT.FR",
    subtitle: "L’encyclopédie vive du ballon rond",
  },
] as const;

export function DocfootExperienceHeader() {
  return (
    <>
      <header className="site-header docfoot-header">
        <div className="docfoot-utility">
          <span>www.docfoot.fr</span>
          <div className="header-account"><InstallApp /><AuthButton /></div>
        </div>

        <div className="experience-stage">
          {experiences.map((experience) => (
            <section className={`experience-brand experience-${experience.key}`} key={experience.key} aria-label={`Expérience ${experience.letter} — ${experience.subtitle}`}>
              <div className="experience-identity">
                <img className="docfoot-logo" src={experience.logo} alt="" width="88" height="88" />
                <div>
                  <strong className="docfoot-title">{experience.title}</strong>
                  <span className="docfoot-subtitle">{experience.subtitle}</span>
                </div>
              </div>

              {experience.key === "data-lab" && (
                <>
                  <div className="experience-widget lab-summary">
                    <span>Matchs analysés</span><strong>4 812</strong>
                    <div className="mini-chart" aria-label="Indice xG 75 sur 100"><i /><i /><i /><i /><i /></div>
                  </div>
                  <div className="mobile-lab-carousel" aria-label="Indicateurs d’analyse">
                    <article><span>xG moyen</span><strong>2,74</strong><small>+12 %</small></article>
                    <article><span>Possession</span><strong>58 %</strong><small>Maîtrise</small></article>
                    <article><span>Forme</span><strong>8,1</strong><small>Très bonne</small></article>
                  </div>
                </>
              )}
              {experience.key === "match-day" && (
                <>
                  <div className="experience-widget live-summary">
                    <span className="live-status"><i /> Live</span>
                    <strong>PSG <b>2–1</b> OM</strong><small>78e · Intensité élevée</small>
                  </div>
                  <div className="mobile-live-gauges" aria-label="Intensité du match">
                    <span>Pressing <i style={{ "--gauge": "84%" } as React.CSSProperties} /></span>
                    <span>Occasions <i style={{ "--gauge": "68%" } as React.CSSProperties} /></span>
                    <span>Rythme <i style={{ "--gauge": "91%" } as React.CSSProperties} /></span>
                  </div>
                </>
              )}
              {experience.key === "encyclopedia" && (
                <div className="experience-widget editorial-summary">
                  <span>Le dossier du Doc</span><strong>Les grandes tactiques</strong><small>5 min de lecture</small>
                </div>
              )}
            </section>
          ))}
          <div className="experience-competition-row"><CompetitionSelector /></div>
        </div>

        <div className="header-navigation-row">
          <nav className="header-nav" aria-label="Navigation principale"><PublicNav /></nav>
        </div>
        <a className="prono-promo-banner" href="/pronostics">
          <span>⚽ Prono L1</span><strong>Pronostique. Défie tes proches. Gagne le classement.</strong><b>Découvrir →</b>
        </a>
      </header>

      <div className="mobile-experience-actions" aria-label="Actions rapides">
        <a className="mobile-action mobile-action-data" href="/#resultats" data-experiment-action="launch-analysis" data-experiment-location="mobile-sticky">Lancer une analyse</a>
        <details className="mobile-action mobile-action-live">
          <summary>Pronostic flash <span>1 tap</span></summary>
          <div><p>Qui gagne le prochain match ?</p><a href="/pronostics" data-experiment-action="flash-home" data-experiment-location="mobile-sheet">Domicile</a><a href="/pronostics" data-experiment-action="flash-draw" data-experiment-location="mobile-sheet">Nul</a><a href="/pronostics" data-experiment-action="flash-away" data-experiment-location="mobile-sheet">Extérieur</a></div>
        </details>
        <details className="mobile-action mobile-action-encyclopedia">
          <summary>Le saviez-vous ? <span>Découvrir</span></summary>
          <p>La première compétition nationale française remonte à 1894.</p>
        </details>
      </div>
    </>
  );
}
