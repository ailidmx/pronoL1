import type { FootballMatch } from "@/server/football-repository";
import { BASIC_STATS, STAT_LABELS, numericStat } from "@/lib/statistics";

export type StatValues = Record<string, string | number | null>;

export function StatRows({ home, away, keys }: { home: StatValues; away: StatValues; keys: string[] }) {
  return (
    <div className="stat-list">
      {keys.map((key) => {
        const homeValue = home[key] ?? "—";
        const awayValue = away[key] ?? "—";
        const total = numericStat(homeValue) + numericStat(awayValue);
        const width = total ? Math.round((numericStat(homeValue) / total) * 100) : 50;
        return (
          <div className="stat-row" key={key}>
            <div><strong>{String(homeValue)}</strong><span>{STAT_LABELS[key] ?? key}</span><strong>{String(awayValue)}</strong></div>
            <div className="stat-bar"><i style={{ width: `${width}%` }} /><i style={{ width: `${100 - width}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function MatchStatistics({ match }: { match: FootballMatch }) {
  const home = match.statistics.find((item) => item.teamId === match.homeClub.id)?.values;
  const away = match.statistics.find((item) => item.teamId === match.awayClub.id)?.values;
  if (!home || !away) return <p className="empty-state">Les statistiques détaillées seront publiées dès qu’elles seront disponibles.</p>;
  const keys = BASIC_STATS.filter((key) => key in home || key in away);
  return <StatRows home={home} away={away} keys={keys} />;
}

