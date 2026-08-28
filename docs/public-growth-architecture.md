# Prono L1 Public — architecture foundation

## Product boundary

`apps/public-web/` is an independent, SEO-first application. It shares normalized
football data and domain rules with the private prediction app, but has its own
deployment, routing, analytics, monetization and release lifecycle.

The existing `apps/player-web/` directory remains the private React/Vite migration. The
legacy PHP application remains untouched during this foundation phase.

## Stack decision

- Next.js App Router + React + TypeScript
- Server Components by default; Client Components only for interaction
- Static generation and revalidation for crawlable football pages
- Firebase App Hosting as the intended SSR hosting target
- Firestore through server-only repositories; never expose provider API keys
- Vitest for fast policy/unit tests; Oxlint and strict TypeScript in CI

## Runtime-controlled business policies

Business rules are not embedded in pages:

- `lib/monetization`: named policy profiles (`open`, `balanced`,
  `subscription-first`)
- `lib/experiments`: deterministic, weighted assignments
- a later remote-config adapter will resolve policies without a redeploy
- every exposure and conversion must emit an experiment key and variant

Experiments may change presentation, quota and CTA. They must not create
different indexable facts, titles or canonical URLs for crawlers and users.

## SEO contract

Every indexable template must provide:

- a stable canonical URL
- unique title, description and visible heading
- useful server-rendered content without client JavaScript
- breadcrumb/internal navigation
- applicable schema.org JSON-LD derived from the same source as visible data
- explicit indexability rules for incomplete, duplicate or empty pages
- inclusion in a segmented sitemap only when quality thresholds pass

Robots directives explicitly permit general crawlers, OAI-SearchBot and
ChatGPT-User. This enables discovery; it does not guarantee ranking or citation.

## Planned page families

1. Competition and season
2. Matchday
3. Match
4. Club and club-season
5. Head-to-head
6. Player pages only when the data quality and legal review permit them

Do not mass-index thin permutations. A page enters the sitemap only after its
template has enough unique, useful and current data.

## Delivery sequence

1. Foundation and CI
2. Server data repository + cached Firestore reads
3. Season and matchday templates
4. Match template + structured data
5. Consent, analytics and experiment event pipeline
6. Quotas, account bridge, ads and subscription entitlements
7. Search Console, Bing Webmaster Tools and production sitemap submission

Google measurement setup and consent behavior are documented in
`docs/google-measurement-setup.md`.
