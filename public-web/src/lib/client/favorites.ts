/**
 * Favorites (clubs + matches) — localStorage, no auth yet. Items carry their
 * name + href so the /favoris page can render links without a server fetch.
 */
import { storage } from "./storage";

export type FavoriteItem = { id: string; name: string; href: string };
type Favorites = { clubs: FavoriteItem[]; matches: FavoriteItem[] };

const EMPTY: Favorites = { clubs: [], matches: [] };

export function getFavorites(): Favorites {
  return storage.get<Favorites>("favorites", EMPTY);
}

export function isFavoriteClub(clubId: string): boolean {
  return getFavorites().clubs.some((club) => club.id === clubId);
}

export function isFavoriteMatch(matchId: string): boolean {
  return getFavorites().matches.some((match) => match.id === matchId);
}

export function toggleFavoriteClub(item: FavoriteItem): boolean {
  const favorites = getFavorites();
  const exists = favorites.clubs.some((club) => club.id === item.id);
  const clubs = exists
    ? favorites.clubs.filter((club) => club.id !== item.id)
    : [...favorites.clubs, item];
  storage.set("favorites", { ...favorites, clubs });
  return !exists;
}

export function toggleFavoriteMatch(item: FavoriteItem): boolean {
  const favorites = getFavorites();
  const exists = favorites.matches.some((match) => match.id === item.id);
  const matches = exists
    ? favorites.matches.filter((match) => match.id !== item.id)
    : [...favorites.matches, item];
  storage.set("favorites", { ...favorites, matches });
  return !exists;
}

