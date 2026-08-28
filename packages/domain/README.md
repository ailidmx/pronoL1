# Shared modules (Prono-L1)

Pure, dependency-free modules shared between the frontend (`apps/player-web/`) and backend
(`functions/`). ESM (`"type": "module"` — see `package.json`).

- `firestore-paths.js` — single source of truth for collection/subcollection
  names + document path builders. Never hardcode a collection name.
- `validation.js` — validation primitives + `validateFields` (mirrors
  `firestore.rules`).
- `payload-builders.js` — payload builders; every Firestore write goes through
  a builder (stamps `updatedAt` / `sourceHost`, validates the schema).
- `index.js` — public barrel (import everything from here).

Run the tests:

```bash
node --test shared/
```
