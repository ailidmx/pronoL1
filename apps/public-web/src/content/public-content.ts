export const publicContent = {
  hero: {
    eyebrow: "Scores, statistiques et analyses football",
    title: "Tout le foot. Tous les chiffres. Avant et après le match.",
    titleMessages: ["Tout le foot.", "Tous les chiffres.", "Avant et après le match."],
    description: "Scores, faits de jeu, compositions, classements et confrontations réunis dans des pages rapides, lisibles et actualisées.",
  },
  tiers: [
    { name: "Accès libre", price: "0 €", featured: false, features: ["Scores et calendrier", "Classements", "Derniers résultats", "Publicités"] },
    { name: "Compte gratuit", price: "0 €", featured: true, features: ["Jusqu’à 10 analyses par jour", "Favoris et historique", "Alertes matchs", "Publicités"] },
    { name: "Premium", price: "Bientôt", featured: false, features: ["Analyses illimitées", "Statistiques avancées", "Sans publicité", "Avantages Prono L1"] },
  ],
  featureCards: [
    { title: "Résultats détaillés", text: "Score, minute des buts, cartons, remplacements et chronologie complète du match." },
    { title: "Compositions", text: "Onze de départ, remplaçants, entraîneurs et dispositifs tactiques dès leur publication." },
    { title: "Forme et confrontations", text: "Derniers matchs, séries en cours et face-à-face pour comprendre chaque affiche." },
    { title: "Classements", text: "Position, points, différence de buts et dynamique récente dans chaque compétition." },
  ],
} as const;
