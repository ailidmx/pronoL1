# Public football coverage — multi-competition plan

## Current baseline

The public application currently publishes Ligue 1 2026-27 data from Firestore:

- clubs;
- fixtures and scores;
- standings;
- a freshness timestamp.

The UI and routes now support separate season, matchday, match and club pages.
Optional match `events` and `lineups` are already accepted by the server model,
but the scheduled ingestion still needs to populate them.

## Target competitions

Roll out by audience value and API cost, not all at once:

1. UEFA Champions League (API-Football league 2)
2. UEFA Europa League (3)
3. UEFA Conference League (848)
4. Premier League (39), LaLiga (140), Serie A (135), Bundesliga (78)
5. Coupe de France and major international tournaments after data-quality review

The competition registry lives in `public-web/src/config/competitions.ts`. A
competition remains `planned` and excluded from sitemaps until its Firestore
documents pass the publication threshold.

## Firestore target model

Avoid collisions between competitions and seasons:

- `competitions/{competitionId}`
- `seasons/{competitionId}_{startYear}`
- `clubs/{apiTeamId}`
- `matches/{apiFixtureId}` with `competitionId`, `seasonId`, `updatedAt`
- `standings/{competitionId}_{startYear}_general`

Match detail fields:

- `events[]`: minute, extraMinute, teamId, type, detail, player, assist
- `lineups[]`: teamId, formation, coach, starters, substitutes
- later: `statistics[]`, venue, referee and attendance when licensing permits

## Sync jobs

Use separate schedules so expensive endpoints do not run for every historical
fixture every hour:

1. `syncCompetitionCatalog` daily
2. `syncFixtures` hourly for active competitions
3. `syncLiveMatchDetails` every 5 minutes only for live fixtures
4. `syncRecentMatchDetails` hourly for fixtures completed in the last 48 hours
5. `backfillMatchDetails` manually in bounded batches

Every run writes `syncRuns/{job}_{competitionId}` with start time, completion
time, counts, API errors and last successful source update.

## SEO publication rules

Index only pages with useful unique server-rendered data:

- competition-season: standings or at least one match;
- matchday: at least one fixture;
- match: two identified clubs plus date or score;
- club: at least three fixtures or a standings row;
- head-to-head: at least two historical meetings.

Do not create indexable pages for planned competitions, empty filters, arbitrary
query combinations or placeholder players. Sitemaps are generated from the same
Firestore snapshot used by the pages.

## Delivery phases

### Phase A — now

- commercial one-page landing;
- live Ligue 1 overview;
- crawlable club, matchday and match pages;
- dynamic sitemap and visible data freshness;
- reserved AdSense placements.

### Phase B — detailed Ligue 1

- ingest facts of play and lineups;
- add match statistics and richer head-to-head history;
- add Search Console monitoring and page-quality thresholds;
- introduce anonymous/free/premium access enforcement.

### Phase C — European cups

- migrate standings IDs to include `competitionId`;
- activate C1, then C2 and C3;
- validate knockout-round naming and aggregate-score handling;
- publish only after one complete sync and QA pass.

### Phase D — major domestic leagues

- activate leagues one at a time;
- measure indexation, crawl budget, API cost and ad revenue per competition;
- pause expansion when content quality or freshness falls below target.

