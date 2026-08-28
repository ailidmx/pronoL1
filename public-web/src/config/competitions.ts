export type Competition = {
  id: string;
  apiFootballId: number;
  name: string;
  shortName: string;
  country: string | null;
  route: string;
  seasonId: number;
  seasonLabel: string;
  status: "live" | "planned";
};

export const competitions: Competition[] = [
  { id: "ligue-1", apiFootballId: 61, name: "Ligue 1", shortName: "L1", country: "France", route: "ligue-1", seasonId: 2026, seasonLabel: "2026-2027", status: "live" },
  { id: "champions-league", apiFootballId: 2, name: "Ligue des champions", shortName: "C1", country: null, route: "ligue-des-champions", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
  { id: "europa-league", apiFootballId: 3, name: "Ligue Europa", shortName: "C2", country: null, route: "ligue-europa", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
  { id: "conference-league", apiFootballId: 848, name: "Ligue Conférence", shortName: "C3", country: null, route: "ligue-conference", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
  { id: "premier-league", apiFootballId: 39, name: "Premier League", shortName: "PL", country: "Angleterre", route: "premier-league", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
  { id: "la-liga", apiFootballId: 140, name: "LaLiga", shortName: "Liga", country: "Espagne", route: "la-liga", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
  { id: "serie-a", apiFootballId: 135, name: "Serie A", shortName: "Serie A", country: "Italie", route: "serie-a", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
  { id: "bundesliga", apiFootballId: 78, name: "Bundesliga", shortName: "Bundesliga", country: "Allemagne", route: "bundesliga", seasonId: 2026, seasonLabel: "2026-2027", status: "planned" },
];

export const liveCompetitions = competitions.filter((competition) => competition.status === "live");
export const primaryCompetition = liveCompetitions[0];

