# Stratégie de recette et de bascule

## 1. Objectif

Prouver que le nouveau système rend les mêmes services que l'historique, avec
des données correctes, des droits plus sûrs et une expérience stable sur mobile.

## 2. Pyramide de tests

### 2.1 Tests métier purs

- scoring exact, bon résultat, écart et buts partiels ;
- bonus et quiz ;
- calculs H2H, forme, tendances et classements ;
- phase/round et règles multi-compétition ;
- limites freemium ;
- génération des idempotency keys de notifications.

Chaque règle migrée utilise des fixtures issues de cas historiques anonymisés et
compare ancien/nouveau lorsque le PHP est déterministe.

### 2.2 Tests de repositories et Functions

- Auth requise et claims ;
- validation stricte des payloads ;
- isolation entre utilisateurs et communautés ;
- verrouillage au coup d'envoi ;
- transactions et idempotence ;
- correction/recalcul ;
- pagination et limites ;
- comportement en absence de documents ;
- émulateurs Firebase pour succès et refus.

### 2.3 Tests de migration

Pour chaque collection :

- nombre de sources, insérés, mis à jour, ignorés et rejetés ;
- unicité et références orphelines ;
- échantillons par saison/compétition ;
- totaux de points avant/après ;
- rapport JSON/Markdown conservé comme artefact CI ;
- seconde exécution sans duplication ;
- dry-run obligatoire avant écriture en production.

### 2.4 Tests E2E

Parcours minimaux :

1. choisir un compte Google et entrer dans le Player ;
2. changer de thème puis recharger ;
3. changer compétition/saison/journée ;
4. saisir, modifier et effacer un pronostic avant clôture ;
5. vérifier le refus après clôture ;
6. ouvrir H2H, Forme, Stats, Tendances et Composition ;
7. consulter le verdict et le détail des points ;
8. parcourir Podium, Championnat, Quiz, Bonus et FAQ ;
9. créer/rejoindre une communauté selon le plan ;
10. activer/tester e-mail, Telegram et push ;
11. réaliser les opérations Admin associées.

### 2.5 Tests visuels

Matrice obligatoire pour les écrans Player structurants :

| Axe | Variantes |
| --- | --- |
| Thème | clair, sombre |
| Taille | 360×800, 412×915, tablette, desktop |
| Statut | à venir, direct, terminé, reporté, annulé |
| Données | complètes, partielles, absentes, erreur |
| Compétition | Ligue 1, Champions League |
| Contenu | noms courts, noms longs, 0/10/30+ lignes |

Les captures historiques servent de référence de contenu et de hiérarchie, pas
de pixel-perfect aveugle si celui-ci nuit à l'accessibilité.

## 3. Scénarios de référence

Le dataset de recette doit contenir au minimum :

- un match futur ouvert ;
- un match à moins de cinq minutes du coup d'envoi ;
- un match en direct ;
- un match terminé avec score corrigé ;
- un match sans cotes ;
- un match avec statistiques partielles ;
- un match avec compositions, notes, cartons et substitutions ;
- formations classiques et formation inconnue ;
- H2H avec nuls, domicile et extérieur ;
- tendance à faible et fort échantillon ;
- journée multi-dates ;
- phase de ligue UEFA et confrontation aller-retour ;
- joueur gratuit à la limite ; joueur premium ; admin ; compte refusé ;
- endpoint push expiré et chat Telegram bloqué.

## 4. Recette des notifications

Pour chaque événement/canal :

- utilisateur éligible et consentant ;
- utilisateur désabonné ;
- préférence partielle ;
- envoi test ;
- retry après erreur temporaire ;
- abandon après erreur définitive ;
- déduplication après relance de fonction ;
- lien profond vers le bon match et la bonne compétition ;
- fuseau et langue ;
- absence de fuite de contenu d'une communauté.

Mesures : tentatives, succès, échecs temporaires/définitifs, latence, endpoints
invalidés et opt-out. Les tokens, Chat IDs et adresses ne doivent pas apparaître
en clair dans les logs applicatifs ordinaires.

## 5. Sécurité et droits

La recette négative vérifie notamment :

- lecture du profil d'un autre utilisateur ;
- lecture anticipée des pronostics adverses ;
- écriture après coup d'envoi ;
- contournement des limites gratuites ;
- mutation d'un entitlement depuis le client ;
- accès à une communauté non rejointe ;
- appel d'une action Admin sans claim ;
- changement arbitraire de compétition dans un document ;
- réutilisation/rejeu d'un webhook Telegram ;
- exposition d'un secret fournisseur.

## 6. Performance et coûts

Budgets initiaux à mesurer puis ajuster :

- interaction principale Player perceptible en moins de 200 ms hors réseau ;
- contenu utile de journée affiché sans cascade de lectures par match ;
- panneaux analytiques chargés à la demande et mis en cache ;
- read models pour éviter les jointures client ;
- aucune synchronisation fournisseur déclenchée par chaque joueur ;
- métrique de lectures/écritures Functions par utilisateur actif ;
- protection contre quotas et tempêtes de notifications.

Les actions « ouvrir tous » doivent utiliser des endpoints batch/read models,
pas multiplier aveuglément les requêtes.

## 7. Accessibilité

- navigation clavier et focus visible ;
- labels des boutons icônes ;
- zones tactiles d'au moins 44 px lorsque possible ;
- contraste AA ;
- informations non transmises uniquement par couleur ;
- modales avec focus piégé et rendu au déclencheur ;
- graphiques accompagnés de valeurs textuelles ;
- respect de `prefers-reduced-motion`.

## 8. Observabilité

### Tableaux de bord

- Auth et refus d'accès ;
- ingestion par compétition/source ;
- fraîcheur matchs/compositions/stats/cotes ;
- erreurs et latence des callables ;
- scoring et recalculs ;
- notifications par événement/canal ;
- consommation Firestore/Functions/API externes ;
- erreurs frontend par application/version.

### Alertes

- aucune synchronisation réussie dans la fenêtre attendue ;
- quota fournisseur proche de la limite ;
- match commencé sans statut à jour ;
- divergence de score ou de points ;
- hausse des erreurs Auth/permission ;
- échec massif d'un canal de notification ;
- absence de données pour une compétition publiée.

Tous les logs structurés portent `app`, `version`, `environment`,
`competitionKey`, `operation` et un correlation ID. Les identifiants personnels
sont minimisés ou hachés.

## 9. Déploiement progressif

1. déployer schéma/règles compatibles avec l'ancien et le nouveau ;
2. migrer en dry-run et corriger les rejets ;
3. activer la lecture nouvelle pour comptes internes ;
4. comparer silencieusement les résultats ancien/nouveau ;
5. ouvrir à une communauté pilote ;
6. augmenter progressivement l'audience ;
7. conserver un rollback de configuration ;
8. arrêter l'ancien traitement seulement après une période stable ;
9. archiver les rapports de réconciliation.

Les mutations sensibles peuvent utiliser une double écriture uniquement si la
réconciliation et le sens de reprise sont explicites. Sinon, une source unique
est préférable.

## 10. Check-list de sortie d'une capacité

- [ ] identifiant `PAR-*` et propriétaire connus ;
- [ ] comportement historique documenté ;
- [ ] modèle multi-compétition validé ;
- [ ] règle freemium/premium/admin définie ;
- [ ] mapping et migration de données testés ;
- [ ] métier couvert par tests ;
- [ ] Security Rules/Functions couvertes par tests négatifs ;
- [ ] UI mobile/desktop terminée ;
- [ ] clair/sombre validés ;
- [ ] chargement, vide, partiel, erreur et retry traités ;
- [ ] accessibilité vérifiée ;
- [ ] logs/métriques/alertes ajoutés ;
- [ ] documentation utilisateur/Admin mise à jour ;
- [ ] captures et recette propriétaire obtenues ;
- [ ] rollback documenté ;
- [ ] statut passé à `MIGRÉ` avec liens de preuve.

## 11. Critères de bascule globale

La nouvelle application peut remplacer la PHP pour un périmètre donné lorsque :

- toutes les capacités P0 et P1 de ce périmètre sont `MIGRÉ` ;
- aucun écart de points non expliqué ne subsiste ;
- la migration est réconciliée ;
- les opérations quotidiennes sont réalisables depuis l'Admin ;
- le support des trois canaux de notification prévu est observable ;
- les incidents bloquants sont nuls pendant la période pilote ;
- un retour arrière a été répété ;
- le propriétaire du produit valide la parité sur téléphone.
