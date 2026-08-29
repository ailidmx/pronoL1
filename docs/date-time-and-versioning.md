# Date, time and build-version contract

This rule applies to `public-web`, `player-web`, `admin-web` and new user-facing surfaces.

## User-facing dates and times

- Store and transport instants as UTC/ISO-8601 (or Firestore Timestamp).
- Never hardcode `Europe/Paris` or another business timezone for a user-facing match time.
- Display times in the browser/device timezone unless a screen explicitly says it represents another timezone.
- Browser formatting must use `Intl.DateTimeFormat` / `toLocaleString` without a forced `timeZone`.
- Server-rendered public HTML may contain a deterministic fallback, but client runtime must localize `<time datetime>` elements to the browser timezone after hydration and on client navigation.
- Scheduled backend jobs may have an explicit timezone when the schedule itself is a business rule; this is separate from display formatting.

## Build versions

Every downloadable/front-end application exposes its build version in the footer.

Format: `YYYY.MM.DD.HHmm`, generated from the build timestamp in UTC. Example: `2026.08.29.2035`.

The value identifies an immutable build; it is not a display of the user's current local time.
