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
            <ol className="player-list">{lineup.starters.map((player) => <li key={player.id ?? player.name}><span>{player.number ?? "—"}</span><strong>{player.name}</strong><small>{player.position ?? ""}</small></li>)}</ol>
            {lineup.substitutes.length ? <details><summary>Remplaçants ({lineup.substitutes.length})</summary><ul className="substitute-list">{lineup.substitutes.map((player) => <li key={player.id ?? player.name}>{player.number ? `${player.number}. ` : ""}{player.name}{player.position ? ` · ${player.position}` : ""}</li>)}</ul></details> : null}
          </section>
        );
      })}
    </div>
  );
}
