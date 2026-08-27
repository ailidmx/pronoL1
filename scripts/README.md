# Scripts (Prono-L1)

One-off operational scripts.

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
