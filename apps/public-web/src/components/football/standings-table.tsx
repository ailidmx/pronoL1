import type { StandingRow } from "@/server/football-repository";
import { ClubMark } from "./club-mark";

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) return <p className="empty-state">Classement indisponible.</p>;

  return (
    <div className="table-scroll">
      <table className="standings-table">
        <thead><tr><th>#</th><th>Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff.</th><th>Pts</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.club.id}>
              <td>{row.rank}</td><th scope="row"><ClubMark club={row.club} /></th>
              <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td>
              <td>{row.difference > 0 ? `+${row.difference}` : row.difference}</td><td><strong>{row.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
