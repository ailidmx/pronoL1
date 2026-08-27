import type { FootballMatch } from "@/server/football-repository";
import { formatMatchDate, matchScore, matchStatusLabel } from "@/lib/football-format";
import { ClubMark } from "./club-mark";

export function MatchList({ matches }: { matches: FootballMatch[] }) {
  if (matches.length === 0) return <p className="empty-state">Aucun match disponible.</p>;

  return (
    <div className="match-list">
      {matches.map((match) => (
        <article className="match-row" key={match.id}>
          <div className="match-meta">
            <time dateTime={match.date ?? undefined}>{formatMatchDate(match.date)}</time>
            <span>{matchStatusLabel(match.status)}</span>
          </div>
          <div className="match-teams">
            <ClubMark club={match.homeClub} />
            <strong>{matchScore(match)}</strong>
            <ClubMark club={match.awayClub} />
          </div>
        </article>
      ))}
    </div>
  );
}
