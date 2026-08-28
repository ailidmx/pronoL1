#!/usr/bin/env node
/**
 * Backfill public match details from API-Football into Firestore.
 * Usage: API_FOOTBALL_KEY=... GOOGLE_APPLICATION_CREDENTIALS=... \
 *   node scripts/sync-match-details.mjs --season=2026 --status=termine --limit=50
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const key = process.env.API_FOOTBALL_KEY;
if (!key) throw new Error("Missing API_FOOTBALL_KEY");
if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const season = Number(args.season ?? 2026);
const limit = Math.max(1, Number(args.limit ?? 50));
const wantedStatus = args.status ?? "termine";

async function fetchFixture(id) {
  const response = await fetch(`https://v3.football.api-sports.io/fixtures?id=${id}`, { headers: { "x-apisports-key": key } });
  if (!response.ok) throw new Error(`Fixture ${id}: HTTP ${response.status}`);
  return (await response.json()).response?.[0] ?? null;
}
function player(item) { return { id: item.id ?? null, name: item.name ?? "Joueur", number: item.number ?? null, position: item.pos ?? null, grid: item.grid ?? null }; }
function details(item) { return { venue: item.fixture?.venue?.name ?? null, city: item.fixture?.venue?.city ?? null, referee: item.fixture?.referee ?? null, events: (item.events ?? []).map((event) => ({ minute: event.time?.elapsed ?? null, extraMinute: event.time?.extra ?? null, teamId: event.team?.id ?? null, type: event.type ?? "Événement", detail: event.detail ?? null, comments: event.comments ?? null, player: event.player?.name ?? null, playerId: event.player?.id ?? null, assist: event.assist?.name ?? null, assistId: event.assist?.id ?? null })), lineups: (item.lineups ?? []).map((lineup) => ({ teamId: lineup.team?.id, formation: lineup.formation ?? null, coach: lineup.coach?.name ?? null, starters: (lineup.startXI ?? []).map(({ player: value }) => player(value)), substitutes: (lineup.substitutes ?? []).map(({ player: value }) => player(value)) })), statistics: (item.statistics ?? []).map((team) => ({ teamId: team.team?.id, values: Object.fromEntries((team.statistics ?? []).map((stat) => [stat.type, stat.value ?? null])) })), detailsUpdatedAt: FieldValue.serverTimestamp() }; }

const snapshot = await db.collection(collections.matches).where("seasonId", "==", season).get();
const documents = snapshot.docs.filter((document) => !wantedStatus || document.data().statut === wantedStatus).sort((a, b) => String(b.data().date ?? "").localeCompare(String(a.data().date ?? ""))).slice(0, limit);
let written = 0;
for (const document of documents) { const fixture = await fetchFixture(document.id); if (!fixture) continue; await document.ref.set(details(fixture), { merge: true }); written++; console.log(`${written}/${documents.length} fixture ${document.id}`); }
console.log(`DONE: ${written} detailed matches written`);
