import { getApps, initializeApp } from "firebase-admin/app";

// Function modules may resolve Firestore clients at module load time.
// Ensure the default Admin app exists before any function module is evaluated.
if (getApps().length === 0) {
  initializeApp();
}
