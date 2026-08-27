#!/usr/bin/env node
/**
 * Phase 5 — one-off import: legacy MySQL → Firestore.
 *
 * Imports the user-independent reference + match data:
 *   saisons                → seasons/{id}
 *   clubs                  → clubs/{id}
 *   matches                → matches/{id}
 *   cotes_matchs           → matches/{id}/odds
 *   classement_equipes_cache → standings/{seasonId}_{mode}
 *
 * users / pronostics are intentionally skipped for now (they need Firebase
 * Auth UID mapping — see docs/rearchitecture-plan.md §7).
 *
 * Usage (default is DRY-RUN):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASS=... DB_NAME=prono_l1 \
 *   node scripts/import-mysql-to-firestore.mjs --execute
 */
import mysql from "mysql2/promise";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "../shared/firestore-paths.js";

const DRY_RUN = !process.argv.includes("--execute");

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const firestore = getFirestore();

function mapSeason(s) {
  return {
    label: s.label,
    anneeDebut: s.annee_debut,
    anneeFin: s.annee_fin,
    statut: s.statut,
    dateDebut: s.date_debut,
    dateFin: s.date_fin,
    nbJournees: s.nb_journees,
    nbEquipes: s.nb_equipes,
  };
}

function mapClub(c) {
  return {
    seasonId: c.saison_id,
    nom: c.nom,
    nomCourt: c.nom_court,
    code: c.code,
    logoUrl: c.logo_url,
    stade: c.stade,
    ville: c.ville,
    couleur1: c.couleur1,
    couleur2: c.couleur2,
    fdId: c.fd_id,
    apfId: c.apf_id,
    smId: c.sm_id,
  };
}

function mapMatch(m) {
  return {
    seasonId: m.saison_id,
    journee: m.journee,
    date: m.date,
    clubDomId: m.club_dom_id,
    clubExtId: m.club_ext_id,
    scoreDom: m.score_dom,
    scoreExt: m.score_ext,
    statut: m.statut,
    reporte: m.reporte,
    fdId: m.fd_id,
    apfFixtureId: m.apf_fixture_id,
  };
}

function mapOdds(o) {
  return {
    seasonId: o.saison_id,
    coteDomApi: o.cote_dom_api,
    coteNulApi: o.cote_nul_api,
    coteExtApi: o.cote_ext_api,
    coteDomJoueurs: o.cote_dom_joueurs,
    coteNulJoueurs: o.cote_nul_joueurs,
    coteExtJoueurs: o.cote_ext_joueurs,
    figeeLe: o.figee_le,
  };
}

function mapStanding(s) {
  return {
    clubId: s.club_id,
    rang: s.rang,
    j: s.j,
    g: s.g,
    n: s.n,
    p: s.p,
    bp: s.bp,
    bc: s.bc,
    diff: s.diff,
    pts: s.pts,
    pen: s.pen,
    forme: s.forme,
    qualification: s.qualification,
  };
}

async function importTable(conn, table, mapper, targetPath) {
  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  for (const row of rows) {
    const doc = mapper(row);
    const path = targetPath(row);
    if (DRY_RUN) {
      console.log(`[dry-run] ${path}`, JSON.stringify(doc));
    } else {
      await firestore.doc(path).set({ ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return rows.length;
}

async function importStandings(conn) {
  const [rows] = await conn.query("SELECT * FROM classement_equipes_cache");
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.saison_id}_${row.mode}`;
    if (!grouped.has(key)) grouped.set(key, { seasonId: row.saison_id, mode: row.mode, rows: [] });
    grouped.get(key).rows.push(mapStanding(row));
  }
  for (const [key, doc] of grouped) {
    const path = `${collections.standings}/${key}`;
    if (DRY_RUN) {
      console.log(`[dry-run] ${path} (${doc.rows.length} rows)`);
    } else {
      await firestore.doc(path).set({ ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return rows.length;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "prono_l1",
  });
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "EXECUTE"}`);
  console.log(`DB: ${process.env.DB_NAME || "prono_l1"} @ ${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 3307}`);

  const counts = {
    seasons: await importTable(conn, "saisons", mapSeason, (r) => `${collections.seasons}/${r.id}`),
    clubs: await importTable(conn, "clubs", mapClub, (r) => `${collections.clubs}/${r.id}`),
    matches: await importTable(conn, "matches", mapMatch, (r) => `${collections.matches}/${r.id}`),
    odds: await importTable(conn, "cotes_matchs", mapOdds, (r) => `${collections.matches}/${r.match_id}/odds`),
    standings: await importStandings(conn),
  };

  await conn.end();
  console.log("Summary:", counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
