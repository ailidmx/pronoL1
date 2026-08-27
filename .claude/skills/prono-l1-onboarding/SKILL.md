---
name: prono-l1-onboarding
description: Use at the start of any work on the Prono-L1 repo to load project context, the current architecture, the rearchitecture plan, and the git/PR workflow.
---

# Prono-L1 onboarding

Use this skill to get oriented quickly at the start of a session.

## Steps

1. Read `AGENTS.md` at the repo root (overview, architecture, secrets, git
   workflow, conventions).
2. Read `docs/guide_prono_l1.md` for the player-facing product behavior.
3. Read the most recent `recap-session-*.md` to see where the last session
   stopped.
4. Check the git state:
   ```bash
   git status
   git --no-pager log --oneline -10
   git branch --show-current
   ```
5. Decide whether the task touches the LEGACY PHP/MySQL app (`api/`, `app.js`,
   `index.php`, `style.css`) or the new Node/Firestore/React stack (Phase 2).
   Follow the matching conventions in `AGENTS.md`.

## Key facts

- Backend (legacy): PHP + PDO → MySQL — `prono_l1` (prod) / `prono_l1_test`
  (test), `127.0.0.1:3307`.
- Frontend (legacy): vanilla JS `app.js` + `index.php` + `style.css` + PWA.
- Secrets: `api/config.php` is gitignored — never commit secrets.
- Git: single `main`, PR-based, conventional commits.
