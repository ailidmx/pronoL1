# 🧩 Conception — Groupes / ligues privées (Prono-L1)

> Document préparatoire, à déposer dans une future conversation le jour où on attaque
> l'implémentation. Rien n'est codé à ce stade — c'est une idée en réserve, non prioritaire,
> à activer selon les retours des joueurs après le lancement du 17/08/2026.

---

## 1. Objectif

Permettre à un joueur d'appartenir à un ou plusieurs groupes privés (ex : "les collègues",
"la famille"), avec un classement filtré par groupe en plus du classement général existant.
Ligue 1 uniquement au départ (pas CDM, sauf demande explicite plus tard).

## 2. Principes retenus

- **Création ouverte à tout joueur**, pas seulement à l'admin — chacun peut créer son groupe.
- **Adhésion par code d'invitation** généré à la création du groupe.
- **Le créateur devient "propriétaire"** du groupe par défaut.
- **L'admin garde un droit de regard total sur tous les groupes**, sans en être membre —
  filet de sécurité si un propriétaire disparaît, abuse de son rôle, ou si deux groupes
  doivent fusionner/être nettoyés. Point ajouté suite à la session du 5 août 2026 : ne pas
  laisser un joueur devenir seul maître d'un groupe sans recours possible.
- **Un joueur peut quitter un groupe lui-même**, à tout moment, sans dépendre du propriétaire.
- Vu le volume (~10 joueurs), pas besoin d'une table de cache dédiée pour le classement par
  groupe : filtrage à la volée en croisant le classement déjà en cache avec les membres du
  groupe. Pas de souci de perf à cette échelle.

## 3. Schéma de base envisagé

```sql
CREATE TABLE groupes (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nom              VARCHAR(100) NOT NULL,
    code_invitation  VARCHAR(20) NOT NULL UNIQUE,
    proprietaire_id  INT NOT NULL,           -- FK vers users, régénérable si le propriétaire part
    saison_id        INT NOT NULL,           -- un groupe est scopé à une saison, comme le reste
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proprietaire_id) REFERENCES users(id),
    FOREIGN KEY (saison_id) REFERENCES saisons(id)
);

CREATE TABLE groupe_membres (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    groupe_id   INT NOT NULL,
    user_id     INT NOT NULL,
    joined_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_membre (groupe_id, user_id),
    FOREIGN KEY (groupe_id) REFERENCES groupes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Points à trancher au moment du codage :
- Un groupe est-il scopé à une saison (`saison_id`), ou permanent d'une saison à l'autre ?
  → Probablement scopé, pour rester cohérent avec le reste de l'appli (classements,
  pronostics, quizz sont tous par saison), mais à confirmer.
- Limite de taille d'un groupe ? Pas nécessaire vu le volume actuel, mais un garde-fou
  raisonnable (ex : max 20 membres) évite les abus sans gêner l'usage réel.
- Le propriétaire est-il automatiquement membre, ou peut-il créer un groupe sans y être ?
  → Probablement automatiquement membre à la création.

## 4. Permissions

| Action | Joueur (membre simple) | Propriétaire du groupe | Admin |
|---|---|---|---|
| Créer un groupe | ✅ | — | ✅ |
| Rejoindre via code | ✅ | — | — |
| Quitter le groupe | ✅ | ✅ (transfère ou dissout) | — |
| Renommer le groupe | ❌ | ✅ | ✅ |
| Régénérer le code d'invitation | ❌ | ✅ | ✅ |
| Exclure un membre | ❌ | ✅ | ✅ |
| Dissoudre le groupe | ❌ | ✅ | ✅ |
| Voir/gérer tous les groupes | ❌ | ❌ (que le(s) sien(s)) | ✅ |
| Changer le propriétaire d'un groupe | ❌ | ❌ | ✅ (filet de sécurité) |

## 5. Interface joueur

- Dans **Podium**, un sélecteur "Classement : Général / [nom du groupe]" si le joueur
  appartient à au moins un groupe (rien de nouveau à afficher sinon).
- Section dédiée (peut-être dans **Mon profil**) :
  - Liste des groupes dont je suis membre, avec bouton "Quitter"
  - Si propriétaire d'un groupe : renommer, régénérer le code, exclure un membre, dissoudre
  - Bouton "Créer un groupe" (nom + génère le code)
  - Bouton "Rejoindre un groupe" (saisie du code)

## 6. Interface admin

Un nouvel onglet ou une section dans l'admin existant :
- Liste de tous les groupes (nom, propriétaire, nb de membres, saison)
- Pour chaque groupe : voir les membres, exclure, dissoudre, changer le propriétaire
- Pas besoin d'une UI séparée compliquée — un tableau simple avec actions suffit vu le volume.

## 7. Calcul du classement filtré

Pas de nouvelle table de cache : au moment d'afficher le classement d'un groupe, on part du
classement général déjà en cache (`classement_*_cache` existant) et on filtre côté requête
sur les `user_id` présents dans `groupe_membres` pour le groupe demandé. Recalcul à la volée,
sans impact perf à l'échelle de ~10 joueurs.

## 8. Questions ouvertes / à trancher au moment du codage

- Un joueur peut-il appartenir à plusieurs groupes simultanément ? (Le besoin initial le
  suppose — "un joueur appartient à un ou plusieurs groupes" — à confirmer que ça reste
  utile en pratique avant de complexifier le sélecteur de classement.)
- Le Quizz doit-il aussi avoir un classement filtré par groupe, ou seulement les pronostics ?
- Notification quand quelqu'un rejoint/quitte un groupe dont on est propriétaire ?
- Faut-il un historique (log) des actions admin sur les groupes, pour traçabilité ?

## 9. Non-objectifs (pour l'instant)

- Pas de groupes publics/découvrables — uniquement par code d'invitation.
- Pas de classement croisé entre groupes.
- Pas d'extension à CDM 2026 sauf demande explicite.

---

*Document créé le 5 août 2026, à la suite d'une discussion sur le design du futur système de
groupes privés. Aucun code n'a été écrit à ce stade.*
