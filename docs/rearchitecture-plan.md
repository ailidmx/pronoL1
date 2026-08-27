# Rearchitecture plan — Prono-L1 (Phase 2)

> Status: proposed — first pass, to be refined as decisions are finalized and
> implementation starts. This doc is the source of truth for the migration.

## 1. Current state

Monolithic **PHP + MySQL + vanilla JS** app (prod `20260711w`).

- Backend: `api/*.php` — PDO → MySQL, one file per domain, dispatched by
  `?action=<verb>` (HTTP GET/POST), JSON responses.
- Frontend: `app.js` + `index.php` + `style.css` + PWA (`sw.js`, `manifest.json`).
- DB: MySQL, 28 tables, `prono_l1` (prod) / `prono_l1_test` (test).

## 2. Data model (28 tables, grouped by domain)

| Domain | Tables |
|---|---|
| Season / config | `saisons`, `bareme_points`, `bonus_config`, `quizz_config`, `formation_positions` |
| Clubs / players | `clubs`, `effectifs`, `stats_joueurs` |
| Matches | `matches`, `cotes_matchs`, `compositions`, `match_stats` |
| Predictions | `pronostics`, `pronostics_bonus`, `bonus_champion_journee` |
| Standings / leaderboards (read models) | `classement_equipes_cache`, `quizz_classement_cache`, `cache_api` |
| Quiz | `quizz_semaine`, `quizz_questions`, `quizz_reponses_possibles`, `quizz_reponses_joueurs`, `quizz_banque_histo` |
| Users / auth / push | `users`, `sessions`, `push_subscriptions`, `push_rappels_envoyes`, `annonces_admin` |

Key facts:
- Almost everything is scoped by `saison_id`.
- The heavy queries (L1 standings, player leaderboards, quiz leaderboard) are
  **already pre-computed into cache tables** — a good fit for Firestore read
  models.
- `pronostics` is the classic many-to-many (user × match).

## 3. Decision: data layer

**Recommendation: migrate to Firestore (NoSQL) with denormalized read models.**

Rationale:
- Phase 3 needs a **public, high-traffic, read-heavy page** (standings, results,
  odds, stats). Firestore security rules give public reads for free, with no
  server to scale.
- Firebase Auth + Firestore + Cloud Functions keep the whole stack on one
  platform.
- The relational "leaderboard" queries are already materialized as cache tables,
  so they map cleanly to Firestore documents.
- ~10 private users today — no write-volume concern.

Trade-off to accept: a few queries (per-match predictions, H2H) need
denormalization + subcollections instead of SQL joins. If any part proves too
relational, fall back to a relational store behind Node (see §8).

## 4. Target Firestore model (first pass)

Top-level collections:

- `users/{userId}` — profile, `notif_*`, `telegramChatId`, `equipeCoeurId`,
  `avatarInitiales`, `isAdmin`. (Password + sessions replaced by Firebase Auth.)
- `seasons/{seasonId}` — label, years, status, `nbJournees`; config as subdocs
  or fields (`bareme`, `bonusConfig`, `quizConfig`).
- `clubs/{clubId}` — `seasonId`, `nom`, `code`, `logoUrl`, colors, `fdId`/`apfId`.
- `players/{playerId}` — `seasonId`, `clubId`, name, `poste`, `numero`, `photoUrl`
  (migrated from `effectifs` + `stats_joueurs`).
- `matches/{matchId}` — `seasonId`, `journee`, `date`, `clubDomId`, `clubExtId`,
  scores, `statut`, `reporte`, external ids. Subcollections:
  - `matches/{matchId}/pronostics/{userId}` — `scoreDomPred`, `scoreExtPred`,
    `resultat`, `points`, `pointsAlt`.
  - `matches/{matchId}/compositions/{clubId}` — formation, coach, lineups.
  - `matches/{matchId}/stats/{clubId}` — raw match stats.
  - `matches/{matchId}/odds` (single doc) — bookmaker/player odds + frozen values.
- `standings/{seasonId}_{mode}` — the `classement_equipes_cache` read model
  (`general`/`domicile`/`exterieur`), one doc per club row or one doc with an
  array.
- `leaderboardPronostics/{seasonId}` — player leaderboard read model.
- `leaderboardQuiz/{seasonId}` — quiz leaderboard read model.
- `quizWeeks/{weekId}` — week + subcollection `questions/{qId}` with
  `answers/{userId}` and `options`.
- `bonus/{seasonId}` — bonus config + `answers/{seasonId}_{userId}` (or
  `pronostics_bonus` as a subcollection).
- `pushSubscriptions/{userId}_{hash}` — web-push subscriptions.
- `pushRappels/{userId}_{matchId}` — sent-reminder markers.
- `annonces/{annonceId}` — admin announcements.

Collections are versioned/scoped by `seasonId` where the SQL schema does the
same (no cross-season joins).

## 5. Backend — Node.js (Firebase Cloud Functions, v2)

- One callable function per domain, mirroring the current `?action=` verbs as
  RPCs (e.g. `users-getProfile`, `matches-listJournee`, `classement-joueurs`).
- Auth via Firebase Auth tokens (replaces `sessions` + password hashing).
  Admin checks via a custom claim or the `users.isAdmin` flag.
- Scheduled Cloud Functions replace `cron_sync.php` (API-Football sync, push
  reminders, odds freeze).
- Secrets (API keys, SMTP, Telegram, VAPID) via Firebase **Secret Manager** —
  never in code or git.

Layering rule (also in AGENTS.md): UI → hooks/use-cases → services →
repositories → Firestore. No Firestore SDK calls inside React components.

## 6. Frontend — React (atomic design)

- Vite + React SPA, PWA retained.
- Atomic structure: `atoms` → `molecules` → `organisms` → `templates` → `pages`.
- Centralized copy module (French, tutoiement).
- Reusable components shared between the private app and the future Phase 3
  public page.

## 7. Migration strategy

1. Create Firebase project(s) + enable Auth (email/password), Firestore, Cloud
   Functions, Hosting, App Check.
2. Scaffold repo (`functions/`, `web/`, shared validation/payload modules).
3. Write a one-off import script: MySQL dump (`prono_l1.sql`) → Firestore,
   mapping per §4. Dry-run first.
4. Port the API domain by domain; keep the legacy PHP app running until parity.
5. Cut over the frontend feature by feature.
6. Keep legacy as a fallback until the new stack is verified in prod.

## 8. Open questions / decisions to finalize

- Firestore vs. relational fallback (if any domain stays relational).
- Firebase project naming (prod + dev?).
- Whether leaderboards are materialized docs (mirroring today's cache tables) or
  computed in Cloud Functions on read.
- App Check + Firestore rules posture before the public Phase 3 page.

