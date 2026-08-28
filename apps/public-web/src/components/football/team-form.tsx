import type { Club, FootballMatch } from "@/server/football-repository";
import { MatchList } from "./match-list";

type Venue = "all" | "home" | "away";
export function TeamForm({ club, matches, venue = "all", limit = 5 }: { club: Club; matches: FootballMatch[]; venue?: Venue; limit?: number }) {
  const completed = matches.filter((match) => match.status === "termine" && (venue === "all" || (venue === "home" ? match.homeClub.id === club.id : match.awayClub.id === club.id))).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, limit);
  const record = completed.reduce((acc, match) => { const home = match.homeClub.id === club.id; const own = home ? match.homeScore : match.awayScore; const other = home ? match.awayScore : match.homeScore; if (own == null || other == null) return acc; if (own > other) acc.wins++; else if (own === other) acc.draws++; else acc.losses++; acc.goalsFor += own; acc.goalsAgainst += other; return acc; }, { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
  return <div><div className="form-summary"><span><strong>{record.wins}</strong> victoires</span><span><strong>{record.draws}</strong> nuls</span><span><strong>{record.losses}</strong> défaites</span><span><strong>{record.goalsFor}-{record.goalsAgainst}</strong> buts</span></div><MatchList matches={completed} /></div>;
}
