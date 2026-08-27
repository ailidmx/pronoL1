#!/usr/bin/env node
/**
 * Phase 5 — import from the MySQL dump (`prono_l1.sql`) → Firestore.
 * No live MySQL needed: parses the mysqldump INSERT statements directly.
 *
 * Usage (dry-run by default):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   node scripts/import-sql-to-firestore.mjs --execute
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const SQL_PATH = process.env.SQL_PATH || fileURLToPath(new URL("../prono_l1.sql", import.meta.url));
const DRY_RUN = !process.argv.includes("--execute");

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const firestore = getFirestore();

// ---------------------------------------------------------------------------
// mysqldump INSERT parser
// ---------------------------------------------------------------------------

function parseValue(sql, start) {
  let i = start;
  if (sql[i] === "'") {
    let out = "";
    i++;
    while (i < sql.length) {
      const ch = sql[i];
      if (ch === "\\") {
        i++;
        const esc = sql[i];
        const map = { n: "\n", r: "\r", t: "\t", "0": "\0", b: "\b", Z: "\u001a" };
        out += map[esc] ?? esc;
        i++;
      } else if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 2;
        } else {
          i++;
          break;
        }
      } else {
        out += ch;
        i++;
      }
    }
    return { value: out, end: i };
  }

  let j = i;
  while (j < sql.length && sql[j] !== "," && sql[j] !== ")") j++;
  const token = sql.slice(i, j).trim();
  if (token === "NULL" || token === "") return { value: null, end: j };
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) return { value: Number(token), end: j };
  return { value: token, end: j };
}

function parseRowTuple(sql, start) {
  let i = start + 1; // skip '('
  const values = [];
  while (i < sql.length) {
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ")") {
      i++;
      break;
    }
    const { value, end } = parseValue(sql, i);
    values.push(value);
    i = end;
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ",") {
      i++;
      continue;
    }
    if (sql[i] === ")") {
      i++;
      break;
    }
    break;
  }
  return { values, end: i };
}

function parseValuesBody(sql, start) {
  const rows = [];
  let i = start;
  while (i < sql.length) {
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ";") {
      i++;
      break;
    }
    if (sql[i] !== "(") break;
    const { values, end } = parseRowTuple(sql, i);
    rows.push(values);
    i = end;
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ",") {
      i++;
      continue;
    }
    if (sql[i] === ";") {
      i++;
      break;
    }
  }
  return { rows, end: i };
}

function parseInsertStatements(sql) {
  const statements = [];
  const re = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES\s*/g;
  let match;
  while ((match = re.exec(sql))) {
    const table = match[1];
    const columns = match[2].split(",").map((c) => c.trim().replace(/`/g, ""));
    const bodyStart = match.index + match[0].length;
    const { rows, end } = parseValuesBody(sql, bodyStart);
    re.lastIndex = end;
    statements.push({ table, columns, rows });
  }
  return statements;
}

function zip(columns, values) {
  const obj = {};
  columns.forEach((c, idx) => {
    obj[c] = values[idx] ?? null;
  });
  return obj;
}

// ---------------------------------------------------------------------------
// MySQL row → Firestore doc mapping (mirrors the §4 model)
// ---------------------------------------------------------------------------

const mapSeason = (s) => ({
  label: s.label,
  anneeDebut: s.annee_debut,
  anneeFin: s.annee_fin,
  statut: s.statut,
  dateDebut: s.date_debut,
  dateFin: s.date_fin,
  nbJournees: s.nb_journees,
  nbEquipes: s.nb_equipes,
});

const mapClub = (c) => ({
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
});

const mapMatch = (m, legacyToApf) => ({
  seasonId: m.saison_id,
  journee: m.journee,
  date: m.date,
  clubDomId: legacyToApf.get(Number(m.club_dom_id)) ?? m.club_dom_id,
  clubExtId: legacyToApf.get(Number(m.club_ext_id)) ?? m.club_ext_id,
  scoreDom: m.score_dom,
  scoreExt: m.score_ext,
  statut: m.statut,
  reporte: m.reporte,
  fdId: m.fd_id,
  apfFixtureId: m.apf_fixture_id,
});

const mapOdds = (o) => ({
  seasonId: o.saison_id,
  coteDomApi: o.cote_dom_api,
  coteNulApi: o.cote_nul_api,
  coteExtApi: o.cote_ext_api,
  coteDomJoueurs: o.cote_dom_joueurs,
  coteNulJoueurs: o.cote_nul_joueurs,
  coteExtJoueurs: o.cote_ext_joueurs,
  figeeLe: o.figee_le,
});

const mapStanding = (s, legacyToApf) => ({
  clubId: legacyToApf.get(Number(s.club_id)) ?? s.club_id,
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
});

async function main() {
  console.log(`Reading ${SQL_PATH}`);
  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const statements = parseInsertStatements(sql);
  const byTable = {};
  for (const st of statements) {
    (byTable[st.table] ??= []).push(...st.rows.map((r) => zip(st.columns, r)));
  }
  console.log(`Tables found: ${Object.keys(byTable).join(", ")}`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "EXECUTE"}`);

  const summary = {};
  const legacyToApf = new Map();
  for (const c of byTable["clubs"] ?? []) {
    if (c.apf_id != null) legacyToApf.set(Number(c.id), Number(c.apf_id));
  }

  const importRows = async (table, mapper, targetPath) => {
    const rows = byTable[table] ?? [];
    for (const row of rows) {
      const doc = mapper(row);
      const path = targetPath(row);
      if (DRY_RUN) {
        console.log(`[dry-run] ${path}`, JSON.stringify(doc));
      } else {
        await firestore.doc(path).set({ ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    summary[table] = rows.length;
  };

  await importRows("saisons", mapSeason, (r) => `${collections.seasons}/${r.id}`);
  await importRows("clubs", mapClub, (r) => `${collections.clubs}/${r.apf_id ?? r.id}`);
  await importRows("matches", (m) => mapMatch(m, legacyToApf), (r) => `${collections.matches}/${r.id}`);

  // odds: 1:1 with matches → store as a field on the match doc
  const odds = byTable["cotes_matchs"] ?? [];
  for (const row of odds) {
    const path = `${collections.matches}/${row.match_id}`;
    const oddsDoc = mapOdds(row);
    if (DRY_RUN) {
      console.log(`[dry-run] ${path} (odds)`, JSON.stringify(oddsDoc));
    } else {
      await firestore.doc(path).set({ odds: oddsDoc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  summary["cotes_matchs"] = odds.length;

  const standings = byTable["classement_equipes_cache"] ?? [];
  const grouped = new Map();
  for (const row of standings) {
    const key = `${row.saison_id}_${row.mode}`;
    if (!grouped.has(key)) grouped.set(key, { seasonId: row.saison_id, mode: row.mode, rows: [] });
    grouped.get(key).rows.push(mapStanding(row, legacyToApf));
  }
  for (const [key, doc] of grouped) {
    const path = `${collections.standings}/${key}`;
    if (DRY_RUN) {
      console.log(`[dry-run] ${path} (${doc.rows.length} rows)`);
    } else {
      await firestore.doc(path).set({ ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  summary["classement_equipes_cache"] = standings.length;

  console.log("Summary:", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
