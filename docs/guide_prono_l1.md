# 📖 Guide du joueur — Prono-L1

Bienvenue ! Ce guide explique tout ce qu'il faut savoir pour jouer sans surprise : les pronostics, les cotes, les bonus, le quizz, les classements, et les réglages de ton compte. Pas besoin de connaître le foot par cœur ni d'autres applis du genre — tout est expliqué ici.

---

## ⚽ 1. Les pronostics

Chaque semaine, tu prédis le **score exact** de chaque match de Ligue 1 (ex : 2-1), avant le coup d'envoi.

- **Tu peux modifier ou effacer ton pronostic autant de fois que tu veux**, tant que le match n'a pas commencé.
- **Dès le coup d'envoi, c'est fermé** : plus aucune modification possible, et les pronostics de tout le monde deviennent visibles sur ce match.

### Comment les points sont calculés

| Cas | Points |
|---|---|
| **Score exact** (ex : tu dis 2-1, le score final est 2-1) | Barème "score exact" — le maximum |
| **Bon résultat** (tu devines victoire/nul/défaite, mais pas le score exact) | Barème "bon résultat" |
| **+ Bonus écart de buts juste** (en plus d'un bon résultat) | Bonus supplémentaire |
| **+ Bonus nombre de buts de l'équipe à domicile juste** | Bonus indépendant — s'applique même si le reste est faux |
| **+ Bonus nombre de buts de l'équipe à l'extérieur juste** | Bonus indépendant — s'applique même si le reste est faux |

⚠️ **Un score exact ne cumule jamais avec les autres bonus** — c'est le montant "score exact" à lui seul, qui est déjà le plus généreux.

Le barème précis (nombre de points pour chaque cas) est visible à tout moment dans l'appli, dans **Mon profil → Règles**, et peut évoluer en cours de saison à la discrétion de l'admin — il est toujours affiché à jour.

---

## 📊 2. Les cotes

Sur chaque match à venir, deux séries de cotes 1 (victoire domicile) / N (nul) / 2 (victoire extérieur) sont affichées :

- **📊 Books** — la moyenne des cotes des bookmakers professionnels (issues d'API-Football)
- **👥 Joueurs** — une cote "maison", calculée à partir des pronostics déjà saisis par les autres joueurs du groupe. Elle n'apparaît qu'à partir de **5 pronostics** enregistrés sur ce match (en dessous, pas assez de données pour être fiable)

Une troisième ligne indique aussi le **score le plus pronostiqué** par le groupe sur ce match.

Les cotes sont **figées** au moment exact du coup d'envoi — elles ne bougent plus après, même si de nouvelles cotes bookmaker arrivent entre-temps.

### Le classement "Avec cotes" (optionnel)

En plus du classement classique, tu peux basculer sur un barème alternatif dans **Podium → Barème → Avec cotes** : la partie "score exact / bon résultat" de tes points est alors multipliée par la cote bookmaker du résultat que tu avais pronostiqué (plafonnée à une valeur maximale, pour éviter qu'un résultat totalement improbable ne fasse exploser le score). Les bonus de buts, eux, restent inchangés. C'est une façon de récompenser davantage les pronostics audacieux (contre toute attente) que les pronostics évidents.

---

## 🎁 3. Les bonus

### Bonus de saison
Une seule fois par saison, avant une date limite fixée par l'admin, tu choisis tes réponses sur des questions comme : qui sera champion de L1 ? Qui finira 2e ? 3e ? Quelles équipes seront reléguées ? Qui sera le meilleur buteur / passeur ? Quelle équipe aura la meilleure attaque / défense ?

- Ces bonus sont **résolus automatiquement** à la toute fin de la saison, dès que tous les matchs ont été joués.
- **Cas particulier 2e/3e** : si tu t'es trompé entre la 2e et la 3e place (tu as inversé les deux), tu touches quand même la **moitié des points** au lieu de zéro.
- En cas d'égalité entre plusieurs équipes ou joueurs, **tout le monde ayant coché le bon choix touche les points en entier**.

### Champion de journée
À chaque journée entièrement terminée, le ou les joueurs en tête du classement de cette journée précise reçoivent automatiquement un bonus. En cas d'égalité, tous les ex-aequo sont récompensés.

---

## 🎯 4. Le Quizz hebdomadaire

Un jeu à part, indépendant des pronostics, pour tester votre culture foot et suivre l'actualité.

### Comment savoir qu'un quizz t'attend

Deux façons de t'en rendre compte, qui se complètent :
1. **Une pastille rouge clignotante** apparaît sur l'onglet "Quizz" du menu, **tant qu'il te reste au moins une question sans réponse**. Elle ne disparaît qu'une fois le quizz entièrement complété — même si tu ne l'as pas vue tout de suite, elle reste là pour te le rappeler.
2. **Une bannière** s'affiche à l'ouverture de l'appli la première fois qu'un nouveau quizz est publié, avec un bouton "Jouer" direct. Elle ne s'affiche qu'une fois (mais la pastille, elle, persiste).

### Les types de questions

| Type | Ce que c'est | Limite de temps |
|---|---|---|
| ⚽ **Pronostic** | Générée automatiquement à partir des matchs de la journée (buteur probable, plus ou moins de 2,5 buts, les deux équipes marquent...) | Aucune — ouverte jusqu'au coup d'envoi du match concerné, comme un pronostic classique |
| 📜 **Histo foot** | Un fait établi et jamais changeant (ex : qui a gagné la Coupe du Monde 1998 ?) | Chronométrée (durée fixée par l'admin — 10 secondes par défaut) |
| 📰 **Actu foot** | Une question sur l'actualité récente, avec toujours une source vérifiable derrière | Chronométrée (durée fixée par l'admin — 10 secondes par défaut) |

Pour les questions chronométrées, un **minuteur bien visible** tourne dès que la question s'affiche — il passe au rouge dans les 3 dernières secondes. Si le temps s'écoule sans réponse de ta part, la question se verrouille automatiquement à 0 point.

### Semaines "normales" vs semaines "de trêve"

- **Semaine normale** (il y a des matchs de L1) : toutes les questions s'affichent en même temps, tu réponds dans l'ordre que tu veux.
- **Semaine de trêve** (pas de matchs L1 cette semaine-là — trêve internationale, coupure hivernale...) : 100% de questions chronométrées, présentées **une par une**. Tu démarres avec un bouton "Commencer le quizz", puis tu avances question après question — impossible de passer à la suivante sans avoir répondu (ou laissé le temps s'écouler).

### Les points

Chaque bonne réponse rapporte un nombre de points fixe (2 par défaut, modifiable par l'admin). Si tu réponds **juste à toutes les questions de la semaine**, tu reçois en plus un **bonus "sans-faute"** sur le total de cette semaine-là — le pourcentage exact (50% par défaut), modifiable par l'admin en cours de saison, est **toujours visible et à jour** dans **Mon profil → Règles**, et rappelé dans la FAQ.

Pour les questions histo/actu, les points sont attribués **immédiatement** après ta réponse (la bonne réponse est déjà connue). Pour les questions pronostic, il faut attendre la fin du match concerné.

### Le classement quizz

Séparé du classement des pronostics, avec son propre **podium visuel** (mêmes couleurs or/argent/bronze que le podium principal). Pour chaque joueur, tu vois aussi : le nombre de quizz joués, le nombre de réponses données, et le nombre de bonnes réponses sur le total de questions publiées cette saison.

---

## 🏆 5. Les classements

Plusieurs vues sont disponibles dans l'appli :

- **Podium** — classement général des pronostics, avec deux réglages combinables :
  - **Avec Bonus / Sans Bonus** — inclut ou non les bonus de saison et de journée dans le total affiché
  - **Classique / Avec cotes** — barème normal ou barème pondéré par les cotes (voir section 2)
- **Par journée** — le classement recalculé sur une seule journée précise
- **Classement équipes** — le classement du championnat lui-même (indépendant de vos pronostics)
- **Buteurs / Passeurs** — les meilleurs artificiers du championnat
- **Classement quizz** — voir section 4

Dans tous les classements, les égalités de points sont regroupées sur le même rang (1, 1, 3...) plutôt que départagées arbitrairement.

---

## ⚙️ 6. Mon compte

Accessible en cliquant sur ton avatar en haut de l'appli :

- **✏️ Changer mon pseudo** — ton nom affiché, et tes initiales d'avatar (2 caractères max, ou laissé automatique)
- **⭐ Mon équipe de cœur** — le club de L1 que tu soutiens ; il est mis en valeur visuellement dans les classements et les matchs
- **🔒 Changer mon mot de passe**
- **🔔 Notifications** — choisis comment être prévenu des résultats et de l'actualité de l'appli : email, notification push (sur ce navigateur), ou Telegram
- **ℹ️ Règles** — le barème de points à jour, toujours consultable en un clic
- **🚪 Déconnexion**

---

*Une question, un doute ? Le bouton "Contacter l'admin" (dans Règles) permet d'écrire directement par email.*
