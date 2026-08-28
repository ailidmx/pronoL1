import type { FootballMatch } from "@/server/football-repository";
import { formatMatchDate, matchScore, matchStatusLabel } from "@/lib/football-format";
import { ClubMark } from "./club-mark";
import { slugify } from "@/lib/slug";

export function MatchList({ matches, linked = true }: { matches: FootballMatch[]; linked?: boolean }) {
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
          {linked ? (
            <a className="match-detail-link" href={`/match/${match.id}/${slugify(`${match.homeClub.name}-${match.awayClub.name}`)}`}>
              Fiche du match <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
