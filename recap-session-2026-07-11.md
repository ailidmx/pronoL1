# Récap de session — Prono-L1 — 11 juillet 2026

**Version finale déployée en prod : `20260711w`**

---

## Ce qui a été fait aujourd'hui

### Corrections diverses (avant les groupes de modifs)
- Icônes PWA corrigées (prod + test) — fond plein-cadre au lieu du fond blanc qui débordait du cercle sur Android
- Bug de synchro des effectifs : cache des clubs mal invalidé selon la saison → corrigé (`app.js`)
- Bug "Club invalide" sur le changement d'équipe de cœur (et 3 autres endroits admin) : la saison affichée n'était pas respectée → corrigé
- Nouvel outil Admin **"Corriger un effectif manuellement"** : ajouter/masquer un joueur à la main quand API-Football est en retard sur le mercato (protégé des resynchros automatiques)
- Nouvel outil Admin **"Synchroniser environnements"** : copie prod↔test des tables de contenu (hors `users`), avec sauvegarde auto et confirmation renforcée pour le sens test→prod

### Groupe A — retouches visuelles ✅ déployé
- "Saison 2026-27" au lieu de "2026-27"
- Position du n° de version (sous le logo, à gauche)
- Club de cœur : gras + fond doré au lieu du liseré (confondu avec la couleur Europa League)
- Distinction bleu clair (tour préliminaire, rang 4) / bleu foncé (places 1-3) pour la Ligue des Champions
- Carte match : logo au-dessus du nom sur mobile pour éviter le retour à la ligne

### Groupe C — mobile/responsive ✅ déployé
- Header épuré (icône thème + avatar seulement, mobile ET PC)
- Menu "Mon profil" regroupant équipe de cœur / changer pseudo / changer mdp / notifications / déconnexion
- Chevron ▾ à côté de l'avatar pour indiquer le menu cliquable
- Compositions des 2 équipes resserrées sur mobile

### Groupe B — classement & stats ✅ déployé
- Records surlignés dans le classement (meilleure attaque/défense, plus de victoires/nuls/défaites)
- Badge de rang sur le logo des clubs, dans les cartes match (dès que la saison a commencé)

### Groupe D — H2H & contact ✅ déployé
- H2H : ordre historique brut conservé, points de couleur fixés sur les 2 clubs du match actuel (gauche = celui qui reçoit aujourd'hui), peu importe qui recevait réellement ce jour-là dans l'historique
- Contact admin par email avec adresse copiable (`docdadi@free.fr`) + lien mailto en secours

---

## Reste à faire (liste Excel `Modifs-Ligue_1.xlsx`)

### Groupe E — à creuser avant de coder (questions/vérifications, pas des specs claires)
- **#5** — Vérifier l'accès au score live et autres data live
- **#18** — Y a-t-il un log du cron ?

### Groupe F — grosses fonctionnalités, à traiter une par une
- **#15** — Retrouver les matchs en retard/reportés (sélecteur de dates ou liste de matchs non terminés)
- **#3** — Instaurer un bonus "champion de journée"
- **#13** — Système de cotes à afficher en entête des pronos (sans montrer les pronos des autres avant le début des matchs)
- **#14** — Garder 2 systèmes de points (avec/sans cotes) en observation pendant 1 saison pour mesurer l'impact — dépend de #13, le plus gros morceau

---

## Point non résolu (externe, hors de notre contrôle)

Effectif de Lyon (et potentiellement d'autres clubs) : API-Football reste en retard sur le mercato estival malgré le signalement via leur chat support (réponse automatique reçue, pas de portail de ticket séparé identifié). L'outil "Corriger un effectif manuellement" permet de patienter en attendant leur mise à jour.

---

## Repères techniques utiles pour la reprise

- **Bases de données** : `prono_l1` (prod) / `prono_l1_test` (test), même serveur MySQL (`127.0.0.1:3307`)
- **Versioning** : format `AAAAMMJJ` + lettre incrémentale par modif dans la journée — à synchroniser dans `app.js` (`APP_VERSION`), `version.php` (`APP_VERSION_COURANTE`), `index.html` (`?v=` sur `app.js` et `style.css`), et une entrée en tête de `changelog.json`
- **Workflow habituel** : test d'abord, confirmation, puis déploiement prod avec le paquet complet de fichiers modifiés
