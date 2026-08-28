/**
 * Leaderboard aggregation — shared rank on ties (1, 1, 3, 3, 5…).
 */
export function buildLeaderboard(entries) {
  const sorted = [...entries].sort((a, b) => b.points - a.points);
  let prevPoints = null;
  let prevRank = 0;
  return sorted.map((entry, index) => {
    const rank = entry.points === prevPoints ? prevRank : index + 1;
    prevPoints = entry.points;
    prevRank = rank;
    return { ...entry, rank };
  });
}
