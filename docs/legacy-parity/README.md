# Programme de parité avec l'application historique

> Statut : plan directeur. La source fonctionnelle est l'application PHP/MySQL
> présente à la racine du dépôt. Ce dossier doit évoluer à mesure que la parité
> est vérifiée.

## 1. Objectif

Migrer l'intégralité du produit historique vers l'architecture Firebase/React
sans réduire sa richesse fonctionnelle ni dégrader son ergonomie mobile.

La migration ne consiste pas à redessiner librement le produit. Elle doit :

- conserver les parcours, informations, raccourcis et états utiles de l'ancien
  Player ;
- conserver le dark mode et le light mode ;
- reprendre les traitements PHP et MySQL dans des modules métier et des Cloud
  Functions testables ;
- rendre chaque fonctionnalité compatible avec plusieurs compétitions ;
- appliquer les droits freemium/premium côté serveur ;
- préserver la séparation entre Public, Player et Admin ;
- améliorer l'accessibilité, la sécurité et la maintenabilité sans supprimer de
  capacité métier.

## 2. Documents

| Document | Rôle |
| --- | --- |
| [inventaire-fonctionnel.md](./inventaire-fonctionnel.md) | Catalogue de référence des fonctions, écrans et comportements historiques |
| [roadmap-migration.md](./roadmap-migration.md) | Lots, dépendances et découpage recommandé des PR |
| [strategie-recette.md](./strategie-recette.md) | Critères de parité, tests, observabilité et procédure de bascule |

## 3. Sources de vérité

Ordre de priorité en cas de contradiction :

1. comportement vérifié dans l'application PHP de production ;
2. règles métier des API PHP et du schéma MySQL ;
3. captures et retours du propriétaire du produit ;
4. guide, FAQ et changelog historiques ;
5. nouvelle implémentation React/Firebase.

La nouvelle interface n'est donc jamais utilisée pour conclure qu'une fonction
historique est inutile. Une suppression ou simplification exige une décision
produit explicite.

## 4. Définition de la parité

Une capacité n'est `MIGRÉE` que si les six couches suivantes sont validées :

1. **Données** : champs, historique, relations, droits et migration contrôlés.
2. **Métier** : calculs et règles comparés à l'ancien système sur des fixtures.
3. **API** : lecture/mutation sécurisée, erreurs structurées, idempotence.
4. **Interface** : contenu, actions, états et responsive reproduits.
5. **Exploitation** : logs, métriques, reprise et commandes Admin disponibles.
6. **Recette** : tests automatiques et validation visuelle en clair/sombre.

Les statuts de suivi autorisés sont :

- `À INVENTORIER` ;
- `INVENTORIÉ` ;
- `DONNÉES PRÊTES` ;
- `BACKEND PRÊT` ;
- `UI PRÊTE` ;
- `EN RECETTE` ;
- `MIGRÉ` ;
- `BLOQUÉ` ;
- `HORS PÉRIMÈTRE` avec décision documentée.

## 5. Principes d'architecture

### 5.1 Identité de compétition

Toute donnée sportive ou communautaire doit porter une identité canonique :

```text
competitionKey = competitionId:seasonId
```

Exemples : `ligue-1:2026`, `champions-league:2026`.

Une fonction qui suppose implicitement la Ligue 1, 18 clubs, 34 journées ou un
format aller-retour ne peut pas être déclarée migrée.

### 5.2 Séparation des applications

- **Public** : pages indexables, découverte, SEO, données gratuites et offres.
- **Player** : pronostics, communautés, jeu, analyses et préférences privées.
- **Admin** : configuration, synchronisation, exploitation et modération.
- **Functions** : autorité métier et mutations.
- **Domain** : règles pures partagées et testées.

Les frontends ne s'importent pas entre eux. Les données et composants réellement
communs passent par les packages partagés.

### 5.3 Freemium

- Offre gratuite : une communauté et une compétition par saison annuelle.
- Premium : communautés et compétitions sans limite produit.
- Les contrôles sont appliqués dans les Functions, jamais uniquement dans l'UI.
- L'accès aux analyses premium doit être piloté par les entitlements, sans
  dupliquer les calculs ni les documents sportifs.

### 5.4 Fidélité visuelle

Le Player historique fixe la densité fonctionnelle, la hiérarchie et les
interactions. Les nouvelles icônes Player et Admin sont en revanche les seules
références de marque : aucune ancienne icône ne doit réapparaître, y compris
dans les splash screens, manifestes, notifications et écrans de chargement.

## 6. Gouvernance

- Une PR ne mélange pas migration métier, refonte graphique et infrastructure
  sans nécessité démontrée.
- Chaque PR cite les lignes de l'inventaire qu'elle couvre.
- Chaque PR ajoute ou met à jour ses tests et ses critères de recette.
- Les captures avant/après sont requises pour les changements Player visibles.
- Aucun secret PHP ne doit être recopié dans Git ; Secret Manager est obligatoire.
- Les doubles écritures et bascules progressives doivent disposer d'un moyen de
  retour arrière documenté.

## 7. Indicateurs du programme

- pourcentage de capacités `MIGRÉ` par domaine ;
- pourcentage d'API historiques remplacées ;
- écarts de calcul ancien/nouveau sur fixtures ;
- taux d'erreur des callables et synchronisations ;
- fraîcheur des données sportives ;
- délivrabilité e-mail, Telegram et push ;
- couverture mobile clair/sombre ;
- incidents de droits ou de fuite intercommunauté ;
- temps nécessaire pour ouvrir une nouvelle compétition.
