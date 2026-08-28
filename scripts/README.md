# Scripts (Prono-L1)

One-off operational scripts.

## import-sql-to-firestore.mjs (primary)

Parses `prono_l1.sql` directly (no live MySQL needed) and rebuilds Firestore.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node import-sql-to-firestore.mjs            # dry-run
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node import-sql-to-firestore.mjs --execute  # write
```

Imports: `saisons`, `clubs`, `matches`, `cotes_matchs` (→ match `odds` field),
`classement_equipes_cache` (→ `standings`).

## sync-football-data.mjs

Seeds/refreshes Firestore from API-Football (clubs + standings) without waiting
for the hourly Cloud Function.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json API_FOOTBALL_KEY=... node sync-football-data.mjs
```

## import-mysql-to-firestore.mjs

Imports the legacy MySQL data into Firestore (Phase 5).

Setup (once):
1. Create a service account key with Firestore access (or reuse the deploy SA).
2. `cd scripts && npm install`
3. Export credentials:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json
   export DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASS=... DB_NAME=prono_l1
   ```

Run (dry-run by default):
```bash
node import-mysql-to-firestore.mjs
node import-mysql-to-firestore.mjs --execute
```

Imports:
- `saisons` → `seasons/{id}`
- `clubs` → `clubs/{id}`
- `matches` → `matches/{id}`
- `cotes_matchs` → `matches/{id}/odds`
- `classement_equipes_cache` → `standings/{seasonId}_{mode}`

Skips for now (needs Firebase Auth UID mapping): `users`, `pronostics`,
`sessions`, `push_*`.

## normalize-clubs.mjs

Re-keys `clubs` to a stable `apfId` (API-Football team id) and remaps
`matches`/`standings` references. Dry-run by default.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node normalize-clubs.mjs --execute
```

## normalize-matches.mjs

Re-keys `matches` to a stable `apfFixtureId` (API-Football fixture id). Legacy
matches with a fixture id merge into `matches/{apfFixtureId}`; past-season
matches without one stay legacy-keyed. Dry-run by default.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node normalize-matches.mjs --execute
```
