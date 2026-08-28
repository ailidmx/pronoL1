import type { FootballMatch } from "@/server/football-repository";

const preferred = ["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "Fouls", "Yellow Cards", "Red Cards", "Goalkeeper Saves", "Total passes", "Passes accurate"];
const labels: Record<string, string> = { "Ball Possession": "Possession", "Total Shots": "Tirs", "Shots on Goal": "Tirs cadrés", "Corner Kicks": "Corners", Fouls: "Fautes", "Yellow Cards": "Cartons jaunes", "Red Cards": "Cartons rouges", "Goalkeeper Saves": "Arrêts", "Total passes": "Passes", "Passes accurate": "Passes réussies" };

function numeric(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function MatchStatistics({ match }: { match: FootballMatch }) {
  const home = match.statistics.find((item) => item.teamId === match.homeClub.id)?.values;
  const away = match.statistics.find((item) => item.teamId === match.awayClub.id)?.values;
  if (!home || !away) return <p className="empty-state">Les statistiques détaillées seront publiées dès qu’elles seront disponibles.</p>;
  const keys = [...preferred.filter((key) => key in home || key in away), ...Object.keys(home).filter((key) => !preferred.includes(key))];
  return <div className="stat-list">{keys.map((key) => {
    const homeValue = home[key] ?? "—"; const awayValue = away[key] ?? "—";
    const total = numeric(homeValue) + numeric(awayValue); const width = total ? Math.round(numeric(homeValue) / total * 100) : 50;
    return <div className="stat-row" key={key}><div><strong>{String(homeValue)}</strong><span>{labels[key] ?? key}</span><strong>{String(awayValue)}</strong></div><div className="stat-bar"><i style={{ width: `${width}%` }} /><i style={{ width: `${100 - width}%` }} /></div></div>;
  })}</div>;
}
