"use client";

import { useEffect, useState } from "react";
import {
  isFavoriteClub,
  isFavoriteMatch,
  toggleFavoriteClub,
  toggleFavoriteMatch,
  type FavoriteItem,
} from "@/lib/client/favorites";

type Props = { kind: "club" | "match"; item: FavoriteItem };

export function FavoriteButton({ kind, item }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(kind === "club" ? isFavoriteClub(item.id) : isFavoriteMatch(item.id));
  }, [kind, item.id]);

  function handleClick() {
    setActive(kind === "club" ? toggleFavoriteClub(item) : toggleFavoriteMatch(item));
  }

  return (
    <button
      type="button"
      className={active ? "fav-button is-active" : "fav-button"}
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? `Retirer ${item.name} des favoris` : `Ajouter ${item.name} aux favoris`}
    >
      <span aria-hidden="true">{active ? "★" : "☆"}</span> {active ? "Favori" : "Ajouter aux favoris"}
    </button>
  );
}
