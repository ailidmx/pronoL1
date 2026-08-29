#!/usr/bin/env node
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  collections,
  DEFAULT_ACCESS_PLANS,
  DEFAULT_SUBSCRIPTION_OFFERS,
} from "@prono-l1/domain";

const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  if (getApps().length === 0) {
    initializeApp({ projectId: "pronol1", credential: applicationDefault() });
  }
  const db = getFirestore();
  console.log(`${DRY_RUN ? "[dry-run]" : "[execute]"} entitlement catalog`);

  for (const plan of DEFAULT_ACCESS_PLANS) {
    const { id, ...data } = plan;
    console.log(`  ${DRY_RUN ? "would set" : "set"} ${collections.accessPlans}/${id}`);
    if (!DRY_RUN) await db.collection(collections.accessPlans).doc(id).set(data, { merge: true });
  }

  for (const offer of DEFAULT_SUBSCRIPTION_OFFERS) {
    const { id, ...data } = offer;
    console.log(`  ${DRY_RUN ? "would set" : "set"} ${collections.subscriptionOffers}/${id}`);
    if (!DRY_RUN) await db.collection(collections.subscriptionOffers).doc(id).set(data, { merge: true });
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
