import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { collections } from "@prono-l1/domain";

const posthogPersonalApiKey = defineSecret("POSTHOG_PERSONAL_API_KEY");
const posthogHost = "https://eu.posthog.com";
const posthogProjectId = 260945;
const experimentKey = "public-theme-v1";

async function assertAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const profile = await getFirestore().collection(collections.users).doc(request.auth.uid).get();
  if (!profile.exists || profile.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

function queryPostHog(sql, name) {
  return fetch(`${posthogHost}/api/projects/${posthogProjectId}/query/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${posthogPersonalApiKey.value()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql }, name }),
  });
}

export const getExperimentDashboard = onCall(
  { cors: true, secrets: [posthogPersonalApiKey] },
  async (request) => {
    await assertAdmin(request);

    const sql = `
      SELECT
        properties.variant AS variant,
        uniqExact(distinct_id) AS exposed_users,
        uniqExactIf(distinct_id, distinct_id IN (
          SELECT distinct_id
          FROM events
          WHERE timestamp >= now() - INTERVAL 30 DAY
            AND event = 'match_detail_opened'
            AND properties.experiment = '${experimentKey}'
        )) AS converted_users
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND event = 'experiment_exposure'
        AND properties.experiment = '${experimentKey}'
      GROUP BY variant
      ORDER BY variant
    `;

    const response = await queryPostHog(sql, "Prono L1 admin experiment dashboard");
    if (!response.ok) {
      console.error("PostHog query failed", response.status, await response.text());
      throw new HttpsError("internal", "Experiment analytics unavailable.");
    }

    const payload = await response.json();
    const rows = payload.results ?? [];
    return {
      experiment: experimentKey,
      windowDays: 30,
      variants: rows.map((row) => ({
        key: String(row[0] ?? "unknown"),
        exposedUsers: Number(row[1] ?? 0),
        convertedUsers: Number(row[2] ?? 0),
        conversionRate: Number(row[1] ?? 0) > 0 ? Number(row[2] ?? 0) / Number(row[1]) : 0,
      })),
      refreshedAt: new Date().toISOString(),
    };
  },
);
