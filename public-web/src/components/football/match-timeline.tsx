import type { FootballMatch } from "@/server/football-repository";

const labels: Record<string, string> = {
  Goal: "But",
  Card: "Carton",
  subst: "Remplacement",
  Var: "VAR",
};

export function MatchTimeline({ match }: { match: FootballMatch }) {
  if (match.events.length === 0) {
    return <p className="empty-state">Les faits de jeu détaillés seront publiés dès leur disponibilité.</p>;
  }
  return (
    <ol className="timeline">
      {match.events.map((event, index) => (
        <li key={`${event.minute}-${event.player}-${index}`}>
          <strong>{event.minute ?? "?"}{event.extraMinute ? `+${event.extraMinute}` : ""}&apos;</strong>
          <span>{labels[event.type] ?? event.type}{event.detail ? ` · ${event.detail}` : ""}</span>
          <span>{event.player ?? "Joueur à confirmer"}{event.assist ? ` — passe de ${event.assist}` : ""}</span>
        </li>
      ))}
    </ol>
  );
}

