"use client";

import { useEffect, useState } from "react";
import { getFavorites, type FavoriteItem } from "@/lib/client/favorites";

type Favorites = { clubs: FavoriteItem[]; matches: FavoriteItem[] };

export default function FavorisPage() {
  const [favorites, setFavorites] = useState<Favorites>({ clubs: [], matches: [] });

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const { clubs, matches } = favorites;
  const empty = clubs.length === 0 && matches.length === 0;

  return (
    <article className="content">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>›</span><span>Favoris</span></nav>
      <p className="eyebrow">Espace personnel</p>
      <h1>Mes favoris</h1>
      {empty ? (
        <p className="empty-state">Aucun favori pour le moment. Clique sur ☆ sur un club ou un match pour l’ajouter ici.</p>
      ) : (
        <>
          {clubs.length > 0 && (
            <section className="fav-section">
              <h2>Clubs</h2>
              <ul className="fav-list">
                {clubs.map((club) => <li key={club.id}><a href={club.href}>{club.name}</a></li>)}
              </ul>
            </section>
          )}
          {matches.length > 0 && (
            <section className="fav-section">
              <h2>Matchs</h2>
              <ul className="fav-list">
                {matches.map((match) => <li key={match.id}><a href={match.href}>{match.name}</a></li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}
