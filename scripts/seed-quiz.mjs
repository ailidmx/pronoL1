#!/usr/bin/env node
/**
 * Seed the published quizzes (weeks + questions + options) for the current
 * season from the SQL dump. One-time migration — future quizzes are generated
 * by the admin flow, not this script.
 *
 * Model: quizWeeks/{weekId} → questions/{qId} → options/{optionId}
 * (answers/{userId} are written at runtime by saveQuizAnswer).
 *
 * Usage (dry-run by default):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node seed-quiz.mjs --execute
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const SQL_PATH = process.env.SQL_PATH || fileURLToPath(new URL("../prono_l1.sql", import.meta.url));
const DRY_RUN = !process.argv.includes("--execute");
const SAISON_ID = 1; // current season (2026-27) in the legacy `saisons` table
const SEASON_KEY = "2026"; // API-Football year == anneeDebut

// --- mysqldump INSERT parser (mirrors import-sql-to-firestore.mjs) ---
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
        if (sql[i + 1] === "'") { out += "'"; i += 2; }
        else { i++; break; }
      } else { out += ch; i++; }
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
  let i = start + 1;
  const values = [];
  while (i < sql.length) {
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ")") { i++; break; }
    const { value, end } = parseValue(sql, i);
    values.push(value);
    i = end;
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ",") { i++; continue; }
    if (sql[i] === ")") { i++; break; }
    break;
  }
  return { values, end: i };
}

function parseValuesBody(sql, start) {
  const rows = [];
  let i = start;
  while (i < sql.length) {
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ";") { i++; break; }
    if (sql[i] !== "(") break;
    const { values, end } = parseRowTuple(sql, i);
    rows.push(values);
    i = end;
    while (i < sql.length && /\s/.test(sql[i])) i++;
    if (sql[i] === ",") { i++; continue; }
    if (sql[i] === ";") { i++; break; }
  }
  return { rows, end: i };
}

function parseInsertStatements(sql) {
  const statements = [];
  const re = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES\s*/g;
  let match;
  while ((match = re.exec(sql))) {
    const columns = match[2].split(",").map((c) => c.trim().replace(/`/g, ""));
    const bodyStart = match.index + match[0].length;
    const { rows, end } = parseValuesBody(sql, bodyStart);
    re.lastIndex = end;
    statements.push({ table: match[1], columns, rows });
  }
  return statements;
}

function zip(columns, values) {
  const obj = {};
  columns.forEach((c, idx) => { obj[c] = values[idx] ?? null; });
  return obj;
}

async function main() {
  if (getApps().length === 0) initializeApp({ projectId: "pronol1", credential: applicationDefault() });
  const db = getFirestore();

  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const tables = {};
  for (const s of parseInsertStatements(sql)) tables[s.table] = s;

  const weeks = (tables.quizz_semaine?.rows ?? []).map((r) => zip(tables.quizz_semaine.columns, r)).filter((w) => w.saison_id === SAISON_ID);
  const questions = (tables.quizz_questions?.rows ?? []).map((r) => zip(tables.quizz_questions.columns, r));
  const options = (tables.quizz_reponses_possibles?.rows ?? []).map((r) => zip(tables.quizz_reponses_possibles.columns, r));

  const weekIds = new Set(weeks.map((w) => w.id));
  const byWeek = new Map();
  for (const q of questions) {
    if (!weekIds.has(q.quizz_semaine_id)) continue;
    if (!byWeek.has(q.quizz_semaine_id)) byWeek.set(q.quizz_semaine_id, []);
    byWeek.get(q.quizz_semaine_id).push(q);
  }
  const qIds = new Set([...byWeek.values()].flat().map((q) => q.id));
  const byQuestion = new Map();
  for (const o of options) {
    if (!qIds.has(o.question_id)) continue;
    if (!byQuestion.has(o.question_id)) byQuestion.set(o.question_id, []);
    byQuestion.get(o.question_id).push(o);
  }

  console.log(`${DRY_RUN ? "[dry-run]" : "[execute]"} Seeding ${weeks.length} quiz weeks → quizWeeks`);
  for (const w of weeks) {
    const weekId = String(w.id);
    const weekDoc = { saisonId: SEASON_KEY, journee: w.journee, statut: w.statut, datePublication: w.date_publication, dateLimite: w.date_limite };
    const qs = byWeek.get(w.id) ?? [];
    if (DRY_RUN) {
      console.log(`  week ${weekId}: journee ${w.journee} (${w.statut}), ${qs.length} questions`);
      continue;
    }
    await db.collection(collections.quizWeeks).doc(weekId).set(weekDoc, { merge: true });
    for (const q of qs) {
      const qRef = db.collection(collections.quizWeeks).doc(weekId).collection("questions").doc(String(q.id));
      await qRef.set({ ordre: q.ordre, type: q.type, sousType: q.sous_type, enonce: q.enonce, matchId: q.match_id, resultatConnu: q.resultat_connu }, { merge: true });
      for (const o of byQuestion.get(q.id) ?? []) {
        await qRef.collection("options").doc(String(o.id)).set({ texte: o.texte, clubId: o.club_id, estCorrecte: o.est_correcte }, { merge: true });
      }
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

