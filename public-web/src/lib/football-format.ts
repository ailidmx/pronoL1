import type { FootballMatch } from "@/server/football-repository";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export function formatMatchDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Horaire à confirmer";
}

export function matchScore(match: FootballMatch) {
  if (match.homeScore === null || match.awayScore === null) return "–";
  return `${match.homeScore} – ${match.awayScore}`;
}

export function matchStatusLabel(status: string) {
  return ({
    a_venir: "À venir",
    en_cours: "En direct",
    termine: "Terminé",
    reporte: "Reporté",
  } as Record<string, string>)[status] ?? status;
}
