#!/usr/bin/env node
/**
 * Seed the bonus questions for the current season (2026-27) into
 * bonus/{seasonId}/questions/{bonusId}, keyed by the API-Football season year
 * (anneeDebut == the seasonId used on matches), NOT the legacy saison_id (1).
 *
 * Source of truth: prono_l1.sql `bonus_config` rows for saison_id = 1.
 *
 * Usage (dry-run by default):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node seed-bonus-config.mjs --execute
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const SEASON_ID = "2026";
const DRY_RUN = !process.argv.includes("--execute");

const QUESTIONS = [
  { id: 1, categorie: "champion", label: "Champion de Ligue 1", points: 15, type: "club", nbChoix: 1, critereAuto: "rang_1" },
  { id: 2, categorie: "dauphins_2", label: "2e du championnat", points: 15, type: "club", nbChoix: 1, critereAuto: "rang_2" },
  { id: 3, categorie: "dauphins_3", label: "3e du championnat", points: 15, type: "club", nbChoix: 1, critereAuto: "rang_3" },
  { id: 4, categorie: "buteur", label: "Meilleur buteur", points: 15, type: "joueur", nbChoix: 1, critereAuto: "buteur" },
  { id: 5, categorie: "passeur", label: "Meilleur passeur décisif", points: 15, type: "joueur", nbChoix: 1, critereAuto: "passeur" },
  { id: 6, categorie: "att_equipe", label: "Meilleure attaque", points: 15, type: "club", nbChoix: 1, critereAuto: "attaque" },
  { id: 7, categorie: "def_equipe", label: "Meilleure défense", points: 15, type: "club", nbChoix: 1, critereAuto: "defense" },
  { id: 8, categorie: "relegues", label: "Relégués en L2 (2 équipes)", points: 15, type: "multi_club", nbChoix: 2, critereAuto: "rang_17_18" },
  { id: 9, categorie: "barragiste", label: "Barragiste L1-L2", points: 15, type: "club", nbChoix: 1, critereAuto: "rang_16" },
];

const DATE_LIMITE = "2027-01-30T23:45:00";

async function main() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
  const db = getFirestore();
  console.log(`${DRY_RUN ? "[dry-run]" : "[execute]"} Seeding ${QUESTIONS.length} bonus questions → bonus/${SEASON_ID}/questions`);

  for (const q of QUESTIONS) {
    const doc = {
      ...q,
      seasonId: SEASON_ID,
      dateLimite: DATE_LIMITE,
      actif: true,
    };
    if (DRY_RUN) {
      console.log(`  would set bonus/${SEASON_ID}/questions/${q.id}: ${q.label}`);
    } else {
      await db.collection(collections.bonus).doc(SEASON_ID).collection("questions").doc(String(q.id)).set(doc, { merge: true });
      console.log(`  set bonus/${SEASON_ID}/questions/${q.id}: ${q.label}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
