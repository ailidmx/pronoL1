# Audit de séparation des applications et du back-office

> **Date :** 28 août 2026  
> **Référence analysée :** `main` après la PR #40  
> **Décisions retenues :** monorepo avec npm workspaces ; SCSS Modules ; design tokens partagés.

## Verdict

La séparation cible doit comporter **trois applications livrables autonomes** :

1. **Public** — présentation, SEO, données football, PWA et fonctionnalités freemium ;
2. **Player** — application privée de pronostics pour les joueurs ;
3. **Admin** — back-office opérationnel de Prono-L1.

Le dépôt n'atteint actuellement que deux tiers de cette cible :

| Application | Code autonome | Build autonome | Déploiement autonome | Styles isolés | Verdict |
|---|---:|---:|---:|---:|---|
| Public | Oui — `apps/public-web/` | Oui — Next.js | Oui — App Hosting | Non, CSS global monolithique | Séparation runtime correcte |
| Player | Oui — `apps/player-web/` | Oui — Vite | Oui — Firebase Hosting | Non, `App.css` global | Séparation runtime correcte |
| Admin | Non | Non | Non | Non | À créer |
| Legacy | Oui, mais monolithique | Pipeline historique | Hébergement historique | CSS global massif | Source de parité temporaire |

L'administration du nouveau stack n'est pas une application. Le champ `isAdmin`, les règles Firestore et quelques droits backend constituent une fondation d'autorisation, pas un back-office.

## 1. État actuel des builds

### Public

- package : `apps/public-web/package.json` ;
- runtime : Next.js App Router ;
- build : `next build` ;
- déploiement : Firebase App Hosting via `apps/apps/public-web/apphosting.yaml` ;
- accès aux données : repository Firestore serveur ;
- cycle de release distinct du Hosting SPA.

### Player

- package : `apps/player-web/package.json` ;
- runtime : React + Vite ;
- build : `vite build` vers `apps/player-web/dist` ;
- déploiement : cible `hosting` de `firebase.json` ;
- accès aux données : Firebase client + fonctions callable.

### Admin

Aucun dossier, package, entrée Vite, configuration Hosting, route ou CI propre. Les fonctions d'administration sont encore dans le legacy `index.php` + `app.js` + `api/*.php`.

## 2. Audit du frontend Player

### Points corrects

- Vite possède son propre package et son propre build.
- Firebase Auth, Firestore et Functions sont initialisés dans un adaptateur identifiable.
- Les grands domaines métier commencent à être séparés par composants : profil, matchs, classement, bonus et quiz.

### Problèmes structurels

- `App.jsx` rend toutes les features dans une longue page, sans router ni shell applicatif.
- Les composants accèdent directement à Firestore.
- `firebase.js` mélange initialisation, fournisseurs d'authentification et catalogue de RPC.
- Il n'existe ni couche use-case, ni repository client, ni gestion d'erreurs partagée.
- Les domaines sont des fichiers à plat dans `apps/player-apps/player-web/src/`.
- `App.css` applique des règles globales, y compris sur `button`, ce qui rend les composants difficiles à isoler.
- Aucun design system, token de thème ou composant UI réutilisable n'est formalisé.
- L'application n'est pas encore au niveau de richesse fonctionnelle et visuelle du legacy.

### Conclusion

Le build est indépendant, mais l'architecture interne ne l'est pas encore suffisamment. Le prochain ajout fonctionnel significatif augmenterait rapidement le couplage.

## 3. Audit du frontend Public

### Points corrects

- Application Next.js réellement indépendante.
- Server Components et repository serveur adaptés au SEO.
- Pages et composants football déjà séparés.
- CI spécifique avec lint, typecheck, tests et build.
- PWA, consentement, politiques de monétisation et stockage local sont isolés par responsabilité.

### Problèmes structurels

- `src/app/styles.css` centralise environ 18 000 caractères dans un seul fichier.
- Les sélecteurs génériques (`nav`, `main`, `footer`, classes transversales) créent des dépendances implicites.
- Les styles de nouvelles features sont ajoutés au milieu du fichier global.
- Les composants ne sont pas propriétaires de leurs styles.
- Les tokens existent seulement sous forme de variables CSS locales à l'application.
- Le thème, les espacements, rayons, ombres, typographie et breakpoints ne sont pas contractuels.

### Conclusion

L'architecture Next.js est correcte, mais le CSS doit être modularisé avant une nouvelle forte croissance du nombre de pages et composants.

## 4. Audit du back-office legacy

Le legacy contient un back-office substantiel. L'inventaire du code révèle au minimum les domaines suivants.

| Domaine admin legacy | Capacités observées | Nouveau stack |
|---|---|---|
| Utilisateurs | liste, date limite, points, reset mot de passe, suppression, confirmation email | Profil utilisateur partiel ; pas d'UI admin |
| Bonus | barème, champion de journée, vérification automatique, validation des réponses | Saisie joueur portée ; administration non portée |
| Quiz | configuration, génération, questions manuelles, publication, résolution, suppression | Saisie joueur portée ; génération/résolution/classement incomplets |
| Données football | sync matchs, journée, stats, clubs, effectifs, corrections joueurs | fonctions de sync présentes ; pas de console admin |
| Annonces | envoi push/email/Telegram et historique | non porté |
| Entraînement | activation, simulation, reset, désactivation | non porté |
| Environnements | copie PROD→TEST et TEST→PROD | non porté ; à repenser, pas à reproduire aveuglément |
| Schéma | comparaison TEST/PROD | non porté ; à remplacer par migrations/validation |
| Opérations | calcul manuel des points et actions de reprise | scoring planifié ; pas d'outil de reprise |
| Clubs/effectifs | sélection, correction, ajout/masquage/suppression de joueur | ingestion partielle ; administration non portée |

Le legacy représente environ :

- `app.js` : 7 272 lignes et 348 kB de source ;
- `style.css` : 4 416 lignes et 123 kB ;
- `index.php` : 823 lignes et 47 kB.

Il ne faut pas porter ce code ligne par ligne. Il faut extraire les **capabilités métier**, décider lesquelles sont encore nécessaires, puis reconstruire leurs commandes backend et leurs écrans.

## 5. Architecture monorepo cible

```
/
  package.json
  package-lock.json
  apps/
    public-web/
      package.json
      next.config.ts
      src/
    player-web/
      package.json
      vite.config.ts
      src/
    admin-web/
      package.json
      vite.config.ts
      src/
  packages/
    domain/
      package.json
      src/
    design-tokens/
      package.json
      src/
        _tokens.scss
        _mixins.scss
        themes/
    ui-primitives/
      package.json
      src/
  functions/
  scripts/
  legacy/
  docs/
  firebase.json
  firestore.rules
```

### Pourquoi cette structure

- Chaque application possède ses dépendances, variables d'environnement, entrée, build et artefacts.
- npm workspaces orchestre les commandes sans imposer Nx ou Turborepo.
- `packages/domain` ne dépend d'aucun frontend.
- `packages/design-tokens` partage les décisions visuelles, pas les pages ni les layouts.
- `packages/ui-primitives` reste volontairement petit : boutons, champs, feedback, surface, typographie.
- Public, Player et Admin peuvent avoir des identités visuelles distinctes tout en conservant les mêmes fondations.

### Scripts racine attendus

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:public": "npm run dev -w @prono-l1/public-web",
    "dev:player": "npm run dev -w @prono-l1/player-web",
    "dev:admin": "npm run dev -w @prono-l1/admin-web",
    "build:public": "npm run build -w @prono-l1/public-web",
    "build:player": "npm run build -w @prono-l1/player-web",
    "build:admin": "npm run build -w @prono-l1/admin-web",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

Les trois builds ne doivent jamais dépendre de l'exécution d'un autre frontend.

## 6. Déploiements cibles

| Application | Cible recommandée | URL/domaine | Déclenchement |
|---|---|---|---|
| Public | Firebase App Hosting | domaine public Stat de Foot | changements Public ou packages consommés |
| Player | Firebase Hosting | domaine privé actuel | changements Player ou packages consommés |
| Admin | deuxième site Firebase Hosting | sous-domaine admin | changements Admin ou packages consommés |

Firebase Hosting supporte plusieurs sites/targets dans un même projet. Le Player et l'Admin peuvent donc conserver Vite tout en produisant deux artefacts indépendants. L'Admin ne doit pas être une route cachée dans le Player.

En local :

- Vite Player sur un port dédié ;
- Vite Admin sur un autre port ;
- Next Public sur son propre port ;
- émulateurs Firebase partagés ;
- variables d'environnement propres à chaque app.

## 7. Architecture SCSS retenue

### Règle

- Un fichier global minimal par application : reset, fontes, thème et structure du document.
- Tous les composants utilisent `*.module.scss`.
- Les tokens et mixins partagés viennent de `@prono-l1/design-tokens`.
- Aucun sélecteur élément global de type `button {}` pour styliser les composants.
- Pas de partage direct d'un gros bundle CSS entre applications.

### Exemple

```
packages/design-tokens/src/
  _colors.scss
  _spacing.scss
  _typography.scss
  _radii.scss
  _shadows.scss
  _breakpoints.scss
  _mixins.scss
  themes/
    _public.scss
    _player.scss
    _admin.scss
```

Les tokens communs couvrent les échelles. Les thèmes attribuent des rôles sémantiques :

- `surface-page`, `surface-panel`, `surface-elevated` ;
- `text-primary`, `text-muted`, `text-danger` ;
- `action-primary`, `action-secondary` ;
- `border-default`, `focus-ring`.

SCSS sert à compiler les tokens et mixins. Les variables CSS générées restent disponibles au runtime pour les thèmes.

## 8. Frontières d'autorisation Admin

Une application séparée ne suffit pas à sécuriser l'administration.

- Vérifier le rôle au chargement du shell Admin.
- Vérifier l'autorisation dans chaque Cloud Function admin.
- Préférer un custom claim Firebase pour l'accès grossier et un profil Firestore pour les capacités détaillées.
- Ne jamais compter sur une route, un bouton caché ou les règles UI.
- Journaliser les commandes sensibles : acteur, action, cible, avant/après, résultat et horodatage.
- Exiger une confirmation renforcée pour les opérations destructives ou multi-environnements.
- Remplacer progressivement les écritures Firestore admin directes par des commandes backend auditables.

## 9. Plan de refactor recommandé

### PR A — fondation monorepo, sans déplacement risqué

- ajouter le `package.json` workspace racine ;
- normaliser les noms de packages ;
- ajouter les commandes indépendantes ;
- adapter la CI pour une matrice Public/Player/Admin ;
- documenter les artefacts ;
- ne déplacer aucun dossier dans cette première PR.

### PR B — design tokens et SCSS Modules

- ajouter Sass dans Public et Player ;
- créer `packages/design-tokens` ;
- migrer un composant pilote dans chaque application ;
- ajouter une règle empêchant la croissance des CSS globaux ;
- préserver visuellement le rendu existant.

### PR C — squelette Admin autonome

- créer `admin-web/` ou directement `apps/admin-web/` ;
- Vite, React, AuthGuard admin, router, shell, page d'accueil ;
- aucun portage métier massif ;
- build, CI et Hosting propres.

### PR D — migration progressive Player

- introduire le router et le shell ;
- regrouper les fichiers par domaines ;
- commencer par `pronostics` ;
- extraire services, repositories et SCSS Modules ;
- continuer domaine par domaine.

### PR E — inventaire de parité Admin

- transformer le tableau de cet audit en backlog vérifiable ;
- classer chaque capacité : porter, remplacer, abandonner ;
- traiter d'abord utilisateurs, quiz/bonus et opérations de scoring ;
- traiter annonces et entraînement ensuite ;
- ne reproduire la copie TEST/PROD qu'après conception de garde-fous.

### PR F — migration CSS Public

- découper le CSS par layout et composants ;
- conserver uniquement reset/tokens/thème en global ;
- ajouter une vérification visuelle mobile/desktop ;
- éviter de mêler cette migration à de nouvelles features SEO.

## 10. Critères d'excellence

La séparation est terminée lorsque :

- chaque application se lance, se teste et se build indépendamment ;
- une panne de build Public ne bloque pas artificiellement le build Admin ou Player ;
- chaque déploiement cible un artefact et un domaine distincts ;
- aucun frontend n'importe le code source d'un autre frontend ;
- le domaine et les tokens sont consommés via des packages explicites ;
- aucun composant nouveau n'ajoute ses styles dans un fichier CSS global ;
- toutes les commandes admin sensibles sont vérifiées côté serveur et auditées ;
- la parité legacy est mesurée, pas supposée ;
- le legacy peut être retiré sans perdre une capacité opérationnelle non identifiée.
