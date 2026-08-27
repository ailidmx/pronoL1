/**
 * Prono-L1 Cloud Functions (Phase 2 backend).
 *
 * Starter module — a health callable to verify the deploy works. The legacy
 * `api/*.php?action=` endpoints will be re-implemented here, domain by domain,
 * as the rearchitecture proceeds (see docs/rearchitecture-plan.md).
 */
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

// RPC: ping the backend.
exports.health = onCall({ cors: true }, () => {
  return {
    ok: true,
    service: "prono-l1",
    time: new Date().toISOString(),
  };
});
