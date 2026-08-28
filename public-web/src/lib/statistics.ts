export const STAT_LABELS: Record<string, string> = {
  "Ball Possession": "Possession",
  "Total Shots": "Tirs",
  "Shots on Goal": "Tirs cadrés",
  "Shots off Goal": "Tirs non cadrés",
  "Blocked Shots": "Tirs contrés",
  "Shots insidebox": "Tirs dans la surface",
  "Shots outsidebox": "Tirs hors surface",
  "Corner Kicks": "Corners",
  "Offsides": "Hors-jeu",
  "Fouls": "Fautes",
  "Yellow Cards": "Cartons jaunes",
  "Red Cards": "Cartons rouges",
  "Goalkeeper Saves": "Arrêts",
  "Total passes": "Passes",
  "Passes accurate": "Passes réussies",
  "Passes %": "Précision des passes",
  expected_goals: "Buts attendus (xG)",
  goals_prevented: "Buts évités",
};

export const BASIC_STATS = [
  "Ball Possession",
  "Total Shots",
  "Shots on Goal",
  "Corner Kicks",
  "Fouls",
  "Yellow Cards",
  "Red Cards",
  "Goalkeeper Saves",
  "Total passes",
  "Passes accurate",
];

export const ADVANCED_STATS = [
  "expected_goals",
  "Shots insidebox",
  "Shots outsidebox",
  "Blocked Shots",
  "Shots off Goal",
  "Offsides",
  "Passes %",
  "goals_prevented",
];

export function numericStat(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
