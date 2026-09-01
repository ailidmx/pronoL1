# Inventaire fonctionnel de référence

Cet inventaire part de `index.php`, `app.js`, `style.css`, `sw.js` et `api/*.php`.
Il décrit la cible de parité, pas seulement l'état actuel de la nouvelle SPA.

## 1. Shell, PWA et navigation

### PAR-SHELL-01 — Initialisation

- écran de chargement et contrôle de session ;
- vérification de version et présentation des nouveautés ;
- restauration de la saison, de la journée, de la page et du thème ;
- préchargement de la journée voisine ;
- gestion des erreurs réseau et rechargement contrôlé ;
- fonctionnement PWA et mode hors connexion clairement signalé.

### PAR-SHELL-02 — En-tête joueur

- logo actuel de l'application ;
- sélecteur de saison et, à terme, de compétition ;
- équipe de cœur ;
- position, points et résumé statistique personnel ;
- accès au détail des statistiques ;
- indicateur de version et nouveautés ;
- compte à rebours avant clôture ;
- avatar/menu de compte compact.

### PAR-SHELL-03 — Navigation principale

- Pronos/Matchs ;
- Podium ;
- Quizz ;
- Championnat ;
- FAQ ;
- Communautés dans la nouvelle offre ;
- état actif évident ;
- barre sticky mobile sans débordement ;
- retour Android cohérent : fermer modale, fermer panneau, retour de page, puis
  sortie seulement en dernier recours.

### PAR-SHELL-04 — Navigation de journée

- premier, précédent, suivant, dernier ;
- liste déroulante des journées ;
- statut à venir/en cours/terminée ;
- raccourcis joueurs, H2H, forme et statistiques ;
- ouverture/fermeture en masse de certains panneaux ;
- dates groupées lorsque les rencontres couvrent plusieurs jours.

### PAR-SHELL-05 — Thèmes et responsive

- dark mode et light mode complets ;
- préférence persistée et prise en compte de la préférence système au premier
  démarrage ;
- contraste, focus et tailles tactiles accessibles ;
- téléphone portrait prioritaire, puis paysage, tablette et desktop ;
- modales scrollables, fermables et non tronquées ;
- aucune perte d'action dans les petits écrans.

## 2. Identité, profil et accès

### PAR-AUTH-01 — Authentification

- connexion Google avec choix explicite du compte ;
- déconnexion et changement de compte ;
- gestion claire des domaines Firebase autorisés ;
- états accès en attente, refusé, erreur temporaire et autorisé ;
- migration ou décision explicite pour inscription, mot de passe oublié,
  confirmation d'e-mail et mot de passe local historiques.

### PAR-PROFILE-01 — Profil

- pseudo/nom affiché ;
- adresse e-mail non modifiable directement ;
- avatar/photo ou initiales ;
- équipe de cœur ;
- préférences de notifications ;
- plan et droits visibles sans exposer les champs d'administration ;
- suppression/désactivation gérée par l'Admin.

### PAR-COMMUNITY-01 — Communautés

- créer, rejoindre par code/lien, quitter et consulter ;
- rôles propriétaire, administrateur et membre ;
- compétitions activées par saison ;
- classement global et par journée dans la communauté ;
- invitation partageable et révocable ;
- règle gratuite : une communauté et une compétition par année ;
- Premium : plusieurs communautés et compétitions ;
- isolation stricte des données privées.

## 3. Pronostics et cartes de match

### PAR-MATCH-01 — Carte avant-match

- équipes, logos, rangs, forme et lieu ;
- date/heure dans le fuseau du joueur ;
- état de disponibilité du pronostic ;
- saisie incrémentale du score, effacement et confirmation ;
- bloc cotes 1/N/2 ;
- comparaison bookmakers/joueurs ;
- indicateur de participation ;
- panneaux Analyse et Composition ;
- verrouillage fiable au coup d'envoi côté serveur.

### PAR-MATCH-02 — Carte en direct/terminée

- score et statut ;
- pronostic du joueur ;
- résultat exact/bon/mauvais ;
- points et décomposition ;
- faits de jeu et données disponibles après synchronisation ;
- état « données indisponibles » distinct d'une erreur ;
- correction d'un score et recalcul idempotent.

### PAR-PRONO-01 — Vues de pronostics

- journée courante ;
- Mes pronos/historique ;
- pronostics de tous les joueurs quand la règle d'ouverture le permet ;
- grille synthétique ;
- programme et résultats ;
- filtres par saison, compétition, journée et communauté ;
- visibilité des pronostics protégée avant la clôture.

### PAR-ODDS-01 — Cotes

- cotes bookmaker au coup d'envoi ;
- cotes dérivées des joueurs ;
- horodatage et source ;
- états non disponibles/périmés ;
- absence de promesse de conseil financier ;
- compatibilité entitlement si certaines vues deviennent premium.

## 4. Centre d'analyse d'un match

### PAR-ANALYSIS-01 — Conteneur

- onglets H2H, Forme, Stats, Tendances et Classement ;
- onglet initial dépendant du statut du match ;
- mémorisation du dernier sous-onglet par carte ;
- fermeture locale et actions « tout ouvrir » ;
- chargement différé, cache et états d'erreur indépendants.

### PAR-H2H-01 — Confrontations directes

- dix dernières confrontations par défaut ;
- filtres Tous, équipe à domicile, équipe à l'extérieur ;
- victoires/nuls/défaites en nombres et pourcentages ;
- barre de répartition ;
- liste date, domicile, score et extérieur ;
- points de couleur vus depuis chaque équipe ;
- périmètre de compétition clairement affiché.

### PAR-FORM-01 — Forme

- derniers matchs de chaque équipe ;
- résultat, adversaire, date et score ;
- buts pour/contre moyens ;
- distinction domicile/extérieur lorsque pertinente ;
- points de forme directement sur la carte ;
- libellé du périmètre statistique.

### PAR-STATS-01 — Statistiques du match

- possession ; tirs totaux, cadrés, dans/hors surface, non cadrés, contrés ;
- passes totales, réussies et précision ;
- corners et occasions si disponibles ;
- fautes, cartons, hors-jeu et statistiques défensives ;
- regroupement thématique ;
- valeurs gauche/droite et barres proportionnelles ;
- traitement des statistiques où une petite valeur est favorable ;
- source, fraîcheur et absence de données.

### PAR-TRENDS-01 — Tendances

- saison courante et toutes saisons ;
- général, domicile et extérieur ;
- taille d'échantillon et avertissement « échantillon réduit » ;
- moyenne de buts ;
- victoires domicile, nuls et victoires extérieur ;
- distributions de buts ;
- plus de 2,5 buts ;
- les deux équipes marquent ;
- clean sheet ;
- possession moyenne ;
- scores fréquents ;
- enseignement synthétique déterministe et explicable ;
- aucune confusion entre absence de données et probabilité nulle.

### PAR-LINEUP-01 — Composition

- formation et note moyenne de chaque équipe ;
- entraîneurs ;
- terrain avec positionnement tactique ;
- titulaires avec photo, nom, numéro, note et capitaine ;
- cartons, buts, passes et entrées/sorties ;
- remplaçants regroupés par poste ;
- minutes et relation remplaçant/remplacé ;
- effectif complet accessible depuis la modale ;
- fallback photo/logo ;
- rendu mobile horizontal/vertical sans chevauchement ;
- formations inconnues rendues proprement.

### PAR-TIMELINE-01 — Faits de jeu

- buts, buts contre son camp et penalties ;
- cartons ;
- remplacements ;
- événements annulés/VAR si la source les expose ;
- ordre chronologique et temps additionnel ;
- relation avec les badges de composition.

## 5. Classements et statistiques de jeu

### PAR-LEAGUE-01 — Championnat

- classement général, domicile et extérieur ;
- programme, résultats et navigation par journée ;
- buteurs et passeurs ;
- fiche club, calendrier et effectif ;
- multi-compétition et formats sans classement linéaire ;
- classement de phase pour les compétitions UEFA modernes.

### PAR-PLAYER-RANK-01 — Podium

- classement général ;
- classement par journée ;
- bonus inclus/exclus ;
- cotes incluses/exclues si la règle existe ;
- rangs ex æquo ;
- détail des points ;
- filtre saison, compétition et communauté.

### PAR-PLAYER-STATS-01 — Statistiques des parieurs

- taux de réussite et décomposition exact/bon/bonus ;
- évolution des rangs ;
- évolution des points cumulés ;
- choix d'échelle ;
- couleurs stables par joueur ;
- résumé personnel dans l'en-tête ;
- règles de confidentialité par communauté.

## 6. Bonus et quiz

### PAR-BONUS-01 — Bonus joueur

- questions club, multi-club et joueur libre ;
- nombre de choix, barème et date limite ;
- réponses existantes et modification avant clôture ;
- validation et calcul ;
- champion de journée ;
- historique et détail des points.

### PAR-QUIZ-01 — Quiz joueur

- quiz courant et bannière d'appel ;
- expérience séquentielle et chronométrée ;
- quiz spéciaux et terminés ;
- historique, détail et possibilité de réponse selon état ;
- classement, podium et classement détaillé ;
- tampon/bonus quiz ;
- pastille de nouveauté et reprise de session ;
- règles accessibles.

## 7. Notifications multicanales

### PAR-NOTIF-01 — Centre de préférences

- e-mail avec adresse du compte ;
- Telegram avec aide dépliable, Chat ID et test ;
- push par navigateur/appareil avec état d'autorisation et test ;
- activation indépendante des canaux ;
- enregistrement explicite et retour de succès/erreur ;
- préférences par utilisateur et abonnements push par appareil.

### PAR-NOTIF-02 — Bot Telegram

- commande `/start` ou premier message ;
- réponse donnant le Chat ID et consignes de liaison ;
- vérification du webhook et signature/secret ;
- message de test ;
- gestion des chat bloqués, inconnus ou migrés ;
- formatage cohérent et lien vers la bonne app/compétition ;
- token stocké dans Secret Manager ;
- journal de livraison sans contenu privé excessif.

### PAR-NOTIF-03 — Événements

Inventaire initial à confirmer contre le PHP et les usages réels :

- annonce administrateur ;
- rappel avant clôture des pronostics ;
- nouveau quiz/bonus et échéance ;
- résultat et points disponibles ;
- début/fin de match suivi ;
- invitation ou activité de communauté ;
- nouveautés/version importante.

Chaque événement précise ses canaux autorisés, son audience, son idempotency key,
son fuseau horaire, ses préférences et son comportement de retry.

### PAR-NOTIF-04 — Exploitation

- modèles de messages versionnés ;
- outbox durable ;
- déduplication ;
- retries avec backoff ;
- statut envoyé/échoué/ignoré ;
- désactivation automatique d'un endpoint push invalide ;
- tableau Admin de santé et test par canal ;
- conformité consentement/désinscription.

## 8. FAQ, règles et nouveautés

### PAR-HELP-01

- FAQ courte et guide complet ;
- bascule entre vues ;
- règlement des pronostics, bonus et quiz ;
- légende des points et couleurs ;
- changelog, modal de nouveautés et historique ;
- contenu français centralisé et tutoiement uniforme.

## 9. Administration

### PAR-ADMIN-01 — Utilisateurs et accès

- liste, recherche et état des utilisateurs ;
- autoriser/refuser l'accès ;
- plan, entitlements et limites ;
- rôle admin par custom claim ;
- confirmation d'e-mail, réinitialisation et suppression si encore nécessaires ;
- historique des opérations sensibles.

### PAR-ADMIN-02 — Données sportives

- synchroniser clubs, matchs, journée et statistiques ;
- synchroniser effectifs et compositions ;
- état de chaque source, quota, fraîcheur et dernier résultat ;
- reprise ciblée par compétition/saison/journée/match ;
- correction manuelle traçable ;
- recalcul des points après correction.

### PAR-ADMIN-03 — Effectifs

- consulter un effectif ;
- ajouter un joueur manuel ;
- masquer/démasquer ;
- synchroniser un club ou tous ;
- gérer les doublons et identités de fournisseurs.

### PAR-ADMIN-04 — Quiz et bonus

- configurer les générateurs ;
- générer semaine normale ou trêve ;
- ajouter/supprimer une question ;
- valider, publier, résoudre et supprimer ;
- configurer barème, délais et champion de journée ;
- vérifier et calculer les bonus.

### PAR-ADMIN-05 — Communication

- rédiger une annonce ;
- sélectionner audience, compétition et communauté ;
- choisir e-mail, Telegram et push ;
- prévisualiser ;
- envoyer de manière asynchrone ;
- consulter l'historique et les résultats de livraison.

### PAR-ADMIN-06 — Outils d'exploitation

- environnement et santé du schéma ;
- copie prod/test historique remplacée par sauvegarde/restauration sûre ;
- mode entraînement/simulation isolé de la production ;
- reset ciblé des pronostics/scores/points en environnement autorisé ;
- journal d'audit ;
- feature flags et expériences ;
- aucun bouton destructeur sans confirmation forte et périmètre explicite.

## 10. Données et intégrations

### PAR-DATA-01 — Référentiels

- compétitions, saisons, phases, groupes et journées ;
- clubs, identités fournisseur et alias ;
- joueurs, entraîneurs, effectifs et transferts ;
- stades et fuseaux si disponibles ;
- provenance et date de synchronisation de chaque donnée.

### PAR-DATA-02 — Matchs

- horaire, statut, score, période et journée/phase ;
- équipes, classement contextuel et compétition ;
- cotes ; composition ; événements ; statistiques ;
- historique des corrections importantes ;
- read models adaptés au Player et au Public.

### PAR-DATA-03 — API football

- matrice des endpoints et quotas par fournisseur ;
- priorité/fallback entre football-data.org et API-Football ;
- contrôle de couverture pour Champions League, Europa et Conference ;
- cache, rate limiting, retry et alertes de quota ;
- fixtures reproductibles pour ne pas tester contre l'API en CI.

### PAR-DATA-04 — Migration MySQL

- mapping table/colonne vers Firestore ;
- conservation des identifiants legacy pour réconciliation ;
- comptages avant/après ;
- sommes de points et échantillons fonctionnels comparés ;
- rapport des lignes rejetées ;
- script idempotent et relançable ;
- anonymisation des dumps de test.

## 11. Multi-compétition

Chaque domaine ci-dessus est testé au minimum sur :

- Ligue 1, championnat aller-retour ;
- Champions League, phase de ligue puis élimination directe ;
- une compétition planifiée sans données complètes, qui doit rester non publiée.

Le déploiement cible suit l'ordre produit : Champions League, Europa League,
Conference League, Angleterre, Espagne, Allemagne puis Italie.

Les différences à modéliser comprennent : phase de ligue, barrages, huitièmes,
quarts, demi-finales, finale, aller/retour, prolongation, tirs au but, classement
de phase, égalité et critères de départage. Les journées ne doivent pas être
utilisées comme abstraction universelle si une `stageRound` est nécessaire.

## 12. Écarts déjà visibles dans la nouvelle SPA

État indicatif, à confirmer pendant l'audit écran par écran :

- disponibles partiellement : Auth Google, accès, matchs, pronostics, podium,
  profil, bonus, quiz, cotes, communautés, championnat ;
- disponibles côté socle mais incomplets côté Player : statistiques premium,
  match center, alertes push ;
- absents ou très incomplets : shell historique, thèmes, H2H, forme détaillée,
  tendances, composition complète, faits de jeu, statistiques des parieurs,
  évolution, centre de notifications, Telegram, FAQ/guide et la majorité de
  l'Admin historique.

Cette liste ne remplace pas la recette : une fonction portant le même nom peut
encore manquer d'états, d'actions ou de règles.
