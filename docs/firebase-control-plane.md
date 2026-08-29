# Firebase Control Plane

The repository exposes a deliberately small Firebase operations surface through GitHub Actions.

## Why

ChatGPT can operate the repository through the GitHub connector, but there is no direct Firebase/GCP connector available in the current environment. The control plane turns an owner-authored GitHub issue comment into a guarded Firebase operation.

## Security model

- Workflow: `.github/workflows/firebase-control-plane.yml`.
- Firebase project is fixed to `pronol1`.
- The trigger only accepts comments on an issue titled exactly `Firebase Control Plane`.
- The comment author must equal `github.repository_owner`.
- Commands are exact-match whitelisted strings; comment contents are never executed as shell code.
- Google authentication uses the existing `FIREBASE_SERVICE_ACCOUNT` GitHub Actions secret.
- Secret values are never accepted in comments, source files, workflow inputs, or logs.
- `POSTHOG_PERSONAL_API_KEY` must exist as a GitHub Actions secret before it can be synchronized to Firebase Secret Manager.

## Commands

```text
/firebase status
/firebase deploy backend
/firebase sync-secret posthog
```

### `/firebase status`

Lists the authenticated Firebase projects and deployed Functions for `pronol1`. Read-only.

### `/firebase deploy backend`

Builds `@prono-l1/functions`, then deploys Firestore and Functions to `pronol1`.

### `/firebase sync-secret posthog`

Reads the GitHub Actions secret `POSTHOG_PERSONAL_API_KEY`, writes it to Firebase Secret Manager as a new secret version, builds the Functions package, then redeploys Functions so consumers receive the new value.

## One-time bootstrap

1. Keep `FIREBASE_SERVICE_ACCOUNT` configured in GitHub Actions (already used by the existing backend deployment workflow).
2. Add `POSTHOG_PERSONAL_API_KEY` in GitHub repository Settings > Secrets and variables > Actions. Do not paste this value into an issue or source file.
3. Merge the control-plane workflow to the default branch. `issue_comment` workflows execute from the default branch.
4. Create one open repository issue titled exactly `Firebase Control Plane`.
5. Test with `/firebase status` before running a write operation.

## Future hardening

Migrate Google authentication from the long-lived service-account JSON secret to GitHub OIDC / Google Workload Identity Federation. The control-plane commands and authorization model can remain unchanged when authentication is migrated.

## Adding commands

New operations must be explicit exact-match cases in the router. Never interpolate an issue comment, issue title, or other user-controlled value into a shell command. Destructive operations such as deleting Firestore data, destroying secrets, or removing deployments must require a separate, explicitly reviewed workflow change rather than being added as generic parameters.
