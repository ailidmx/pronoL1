import { buildCompetitionSeasonId, parseCompetitionSeasonId } from "./competitions.js";

export const DEFAULT_COMPETITION_KEY = buildCompetitionSeasonId("ligue-1", 2026);
export const COMMUNITY_NAME_MAX_LENGTH = 80;

export function normalizeCommunityName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, COMMUNITY_NAME_MAX_LENGTH);
}

export function normalizeCompetitionKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => parseCompetitionSeasonId(item) !== null))];
}

export function normalizeInviteCode(value) {
  if (typeof value !== "string") return "";
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export function validateCommunityInput({ name, competitionIds }) {
  const normalizedName = normalizeCommunityName(name);
  if (normalizedName.length < 3 || normalizedName.length > COMMUNITY_NAME_MAX_LENGTH) return "name";
  const normalizedCompetitions = normalizeCompetitionKeys(competitionIds);
  if (normalizedCompetitions.length === 0) return "competitionIds";
  return null;
}
