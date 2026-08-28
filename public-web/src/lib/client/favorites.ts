/**
 * Favorites (clubs + matches) — localStorage, no auth yet.
 */
import { storage } from "./storage";

type Favorites = { clubs: string[]; matches: string[] };

const EMPTY: Favorites = { clubs: [], matches: [] };

export function getFavorites(): Favorites {
  return storage.get<Favorites>("favorites", EMPTY);
}

export function isFavoriteClub(clubId: string): boolean {
  return getFavorites().clubs.includes(clubId);
}

export function isFavoriteMatch(matchId: string): boolean {
  return getFavorites().matches.includes(matchId);
}

export function toggleFavoriteClub(clubId: string): boolean {
  const favs = getFavorites();
  const clubs = favs.clubs.includes(clubId)
    ? favs.clubs.filter((id) => id !== clubId)
    : [...favs.clubs, clubId];
  storage.set("favorites", { ...favs, clubs });
  return clubs.includes(clubId);
}

export function toggleFavoriteMatch(matchId: string): boolean {
  const favs = getFavorites();
  const matches = favs.matches.includes(matchId)
    ? favs.matches.filter((id) => id !== matchId)
    : [...favs.matches, matchId];
  storage.set("favorites", { ...favs, matches });
  return matches.includes(matchId);
}
