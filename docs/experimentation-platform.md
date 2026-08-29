# Public experimentation platform

## Goal

Provide a lightweight A/B testing foundation for the public site without coupling product code directly to a vendor SDK.

## Architecture

- `src/lib/experiments/registry.ts` is the source of truth for experiments and traffic weights.
- `src/lib/experiments/assign.ts` contains deterministic bucketing shared by tests and server/browser-compatible code.
- `ExperimentBootstrap` assigns a stable anonymous visitor before interactive rendering and exposes the visual variant through `data-public-theme`.
- Exposure events are emitted only after analytics consent.
- `/api/analytics/event` relays accepted events to PostHog using server-side environment variables.
- The public site keeps working with analytics disabled or without PostHog credentials.

## First experiment: `public-theme-v1`

Variants:

- `control` — current dark/lime identity, 50%.
- `editorial` — light editorial football identity, 25%.
- `electric` — more expressive neon/digital identity, 25%.

The experiment is disabled by default. Enable it with:

```env
NEXT_PUBLIC_THEME_EXPERIMENT_ENABLED=true
NEXT_PUBLIC_EXPERIMENT_SALT=<stable-public-salt>
POSTHOG_PROJECT_API_KEY=<project-api-key>
POSTHOG_HOST=https://eu.i.posthog.com
```

Keep the salt stable while an experiment is running; changing it re-buckets visitors.

## Privacy

Variant assignment does not require analytics consent and does not send data off-site. Analytics exposure is sent only when the existing consent preference has `analytics=granted`.

## Initial measurement plan

Primary candidate metric: `match_detail_open_rate`.

Secondary metrics:

- pages per session;
- journey navigation rate;
- club detail open rate;
- CTA to pronostics/private app;
- account creation;
- returning visitor rate;
- ad revenue per session once volume is sufficient.

Always define the primary metric and minimum run conditions before enabling a production experiment.
