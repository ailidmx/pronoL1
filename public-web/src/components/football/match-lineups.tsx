import type { FootballMatch } from "@/server/football-repository";

export function MatchLineups({ match }: { match: FootballMatch }) {
  if (match.lineups.length === 0) {
    return <p className="empty-state">Les compositions seront affichées ici dès leur publication officielle.</p>;
  }
  return (
    <div className="lineup-grid">
      {match.lineups.map((lineup) => {
        const club = lineup.teamId === match.homeClub.id ? match.homeClub : match.awayClub;
        return (
          <section key={lineup.teamId}>
            <h3>{club.name}</h3>
            <p>{lineup.formation ?? "Système à confirmer"}{lineup.coach ? ` · ${lineup.coach}` : ""}</p>
            <ol>{lineup.starters.map((player) => <li key={player}>{player}</li>)}</ol>
            {lineup.substitutes.length ? <details><summary>Remplaçants</summary><p>{lineup.substitutes.join(", ")}</p></details> : null}
          </section>
        );
      })}
    </div>
  );
}
