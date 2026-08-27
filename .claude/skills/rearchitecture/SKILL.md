---
name: rearchitecture
description: Use when working on the Prono-L1 Phase 2 rearchitecture — Node.js backend, MySQL→Firestore migration, React atomic frontend, Firebase Auth — or the Phase 3 shared-API/public-page work.
---

# Rearchitecture (Phase 2 → 3)

Use this skill for the planned rearchitecture of Prono-L1.

## Architecture

- Backend: Node.js (Firebase Cloud Functions).
- Data: migrate MySQL → Firestore (final decision on SQL-vs-Firestore TBD).
- Frontend: React with atomic design (atoms → molecules → organisms → templates
  → pages).
- Auth: Firebase Auth.

## Working rules

1. Keep the legacy PHP/MySQL app working until the new stack reaches parity —
   do not break it.
2. New code follows layers: UI → hooks/use-cases → services → repositories →
   Firestore (no Firestore SDK calls inside React components).
3. Single source of truth for collection names, payload builders, and
   validation (shared modules).
4. Never commit secrets — use Firebase Secret Manager / env vars.
5. Update `AGENTS.md` and the migration notes whenever a decision is made.

## Phase 3 note

The same backend API is shared by a second, public-facing app for web traffic +
AdSense. Design the API to be reusable and the React components to be shareable
between the private app and the public page.
