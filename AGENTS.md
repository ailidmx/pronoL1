# AGENTS.md — Prono-L1

> Living document. Update it whenever you learn something important about the
> project (architecture, gotchas, workflow, conventions). Concise and factual.
> When in doubt, prefer documenting over guessing.

## 1. What this is

**Prono-L1** — a Ligue 1 (French football) prediction game. Players predict the
exact score of each match before kick-off, earn points (score exact / bon
résultat / bonus), and compete on leaderboards (podium, par journée, quizz).
~10 players today. The product is in **French** and addresses players with
**"tu"** (tutoiement).

Docs: `docs/guide_prono_l1.md` (player guide), `docs/faq_prono_l1.pdf`,
`docs/design_groupes_prives.md` (future private groups — not coded yet),
`recap-session-*.md` (work-session notes / where the last session left off).

## 2. Current state (LEGACY — PHP + MySQL + vanilla JS)

This is the deployed "as-is" app (prod version `20260711w`).

- **Backend:** PHP in `api/` — PDO → MySQL, JSON responses. CORS + headers live
  in `api/config.php`.
- **Frontend:** vanilla JS `app.js`, `index.php` (renders the shell),
  `style.css`, `sw.js` (service worker), `manifest.json` (PWA).
- **Database:** MySQL — `prono_l1` (prod) / `prono_l1_test` (test), same server
  `127.0.0.1:3307`. Seed file: `prono_l1.sql`.
- **Versioning:** `AAAAMMJJ` + an incrementing letter per change that day, kept
  in sync across `app.js` (`APP_VERSION`), `api/version.php`
  (`APP_VERSION_COURANTE`), `index.php` (`?v=` on app.js/style.css), and an
  entry at the top of `api/changelog.json`.
- **External services:** football-data.org, api-football (api-sports.io),
  zafronix, Anthropic, Gmail SMTP, Web Push (VAPID), Telegram bot. Keys live in
  `api/config.php`.

## 3. Target architecture (rearchitecture — Phase 2)

Agreed direction (finalize each decision as it is implemented):

- **Backend:** Node.js (Firebase Cloud Functions) replacing the PHP `api/`.
- **Data:** migrate MySQL → **Firestore** (if a relational model is still needed,
  keep SQL behind a Node service — decision TBD).
- **Frontend:** React with **atomic design** (atoms → molecules → organisms →
  templates → pages), replacing the vanilla JS app.
- **Auth:** Firebase Auth.

### Public growth application

- `public-web/` is the independent SEO/freemium application (Next.js App
  Router + TypeScript). Do not merge it into the private `web/` SPA.
- Its monetization and experiment behavior must be resolved through policy
  modules, not hardcoded into pages.
- Indexable pages must render useful HTML on the server and satisfy the SEO
  contract in `docs/public-growth-architecture.md`.
- Multi-competition rollout and publication thresholds are defined in
  `docs/public-multi-competition-plan.md`. Planned competitions must never be
  indexed before their Firestore data is complete enough for the template.
- Public page families now include competition-season, matchday, match and club.
  All sitemap entries must be derived from real Firestore documents.

### Phase plan
1. **Phase 1 — stabilize + cloud-deploy as-is** (fallback): get the current
   PHP/MySQL app running on a hosted PHP+MySQL environment so it stays live
   while the rearchitecture proceeds.
2. **Phase 2 — rearchitecture:** Node.js backend + MySQL→Firestore migration +
   React atomic frontend + Firebase Auth.
3. **Phase 3 — growth:** a second app sharing the same backend API → a public
   page for web traffic + AdSense revenue from the data in the DB.

## 4. Secrets (NEVER commit)

- `api/config.php` is **gitignored** (contains live prod secrets). Each
  environment has its own config; do not copy prod↔test blindly.
- Never commit API keys, DB passwords, SMTP app passwords, VAPID private keys,
  or bot tokens. Use env vars / Firebase Secret Manager in the new stack.
- If a secret was ever committed, treat it as **compromised and rotate it** —
  deleting the file is not enough (it stays in git history).

## 5. Git workflow

- **One mainline:** `main`. Work on feature branches and open **pull requests**
  (no direct commits to `main`).
- **Conventional commits:** `feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`,
  `refactor(...)`.
- **Branch protection:** intended to require PRs before merging. NOTE — GitHub
  **Free** does NOT allow branch-protection rules (classic or rulesets) on
  **private** repos; it requires **GitHub Pro**. Until Pro is enabled, the PR
  flow is enforced by convention, not by GitHub. Once Pro is active, enable
  "Require a pull request before merging" + "Do not allow bypassing".
- Use `gh pr create` and merge the PR (self-merge is fine while solo; add a
  collaborator as a reviewer when there is more than one contributor).

## 6. Conventions

- French UI, tutoiement ("tu/ton/ta") — never "vous".
- API responses: JSON, `Content-Type: application/json; charset=utf-8`.
- Don't hardcode user-facing copy — centralize it (a `content` module in the new
  stack).
- Reuse components (atomic design in the new frontend) — don't reinvent.

## 7. Skills

This repo ships Claude Code skills in `.claude/skills/`:
- `prono-l1-onboarding` — orient any new session on the project.
- `rearchitecture` — playbook for the Phase 2 Node/Firestore/React migration.

*(Add new lessons here as you discover them.)*

## 8. Phase 2 — scoring & leaderboard (new stack)

- **Points barème lives in `shared/scoring.js`** — `decomposePoints` /
  `computePronosticPoints` are a faithful port of the legacy `decomposerPoints`
  (api/utils.php). Rules: exact score → `ptsExact` (5) alone; correct result →
  `ptsBonResultat` (2) + `ptsBonusEcart` (1) only if the goal difference is also
  right; correct home/away goals → `ptsBonusButsDom`/`ptsBonusButsExt` (1 each,
  INDEPENDENT of the result — they can land even on an otherwise "mauvais" prono).
  Defaults in `DEFAULT_BAREME`. `resultat` ∈ `exact`/`bon`/`mauvais` is just the
  SENSE (win/draw/loss) categorization, independent of the partial bonuses.
- **Leaderboard is a read model materialized by `scoreFinishedMatches`**
  (`functions/scoring.js`, scheduled `*/15 * * * *`). It scores finished matches
  (`statut == "termine"` with no `scoredAt`) — writes `points`/`resultat`/
  `decomposition` onto each `matches/{id}/pronostics/{userId}` doc — then
  incrementally adds each prono's decomposition to
  `leaderboardPronostics/{seasonId}/rows/{userId}` (aggregate counts). RANK is
  NOT stored — the client sorts by `points` and applies the shared-rank rule on
  ties. Firestore rules allow signed-in read + admin write on
  `leaderboardPronostics` (the function writes via Admin SDK).
- **Leaderboard season key = `match.seasonId`** (the API-Football year, e.g.
  `2026`), NOT the `saisons` doc id. The sync writes `seasonId: 2026` (the
  `SEASON` constant) onto current-season matches. The UI (`web/src/Classement.jsx`)
  resolves it by finding the season with `statut == "en_cours"` and using its
  `anneeDebut` (== `SEASON`). Do NOT use the `saisons` DB id (1/2) as the
  leaderboard key — it would split points from the synced matches.
- **Known limitation:** `scoreFinishedMatches` marks a match `scoredAt` AFTER
  scoring, and skips already-scored matches, so a corrected FT score is NOT
  re-scored. There is no idempotent delta/transaction yet — for a ~10-player app
  this is acceptable; fix with a Firestore transaction per match if it ever
  matters.

## 9. Phase 2 — profile (new stack)

- **`saveProfile` (`functions/profile.js`) explicitly picks editable fields** —
  it destructures `{ displayName, equipeCoeurId, notifEmail, notifPush, notifTelegram }`
  from `request.data` and never spreads the raw body, so a caller can NOT write
  `isAdmin`/`email`. `avatarInitiales` is DERIVED from `displayName` via
  `initialsFromName` (server-side). Editable schema is `PROFILE_EDITABLE_FIELDS`
  in `shared/users.js` (a subset of `USER_PROFILE_FIELDS` — no `isAdmin`/`email`).
- **`equipeCoeurId` = the club's `apfId`** (the `clubs` doc id), NOT the legacy
  MySQL club id. The Profile form reads the `clubs` collection and uses `d.id`
  as the option value.
- **`getProfile` create path must return a CLEAN object** — do NOT return the
  `FieldValue.serverTimestamp()` sentinels you just wrote to Firestore (the
  callable serializer chokes on them). Return `{ id, ...DEFAULT_USER_PROFILE,
  email }` after the `ref.set(profile)`. (Fixed in #28.)


