import { HttpsError } from "firebase-functions/v2/https";
import {
  collections,
  getDefaultAccessPlan,
  getEntitlementLimit,
  hasEntitlementFeature,
  resolveProfileAccessPlanId,
} from "@prono-l1/domain";

export async function loadRequestAccess(db, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  if (request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verified email required.");
  const profileSnap = await db.collection(collections.users).doc(request.auth.uid).get();
  if (!profileSnap.exists) throw new HttpsError("permission-denied", "User profile required.");
  const profile = profileSnap.data() ?? {};
  const isAdmin = request.auth.token.admin === true || profile.isAdmin === true;
  const planId = resolveProfileAccessPlanId(profile);
  const planSnap = await db.collection(collections.accessPlans).doc(planId).get();
  const plan = planSnap.exists ? { id: planId, ...planSnap.data() } : getDefaultAccessPlan(planId);
  if (!plan?.enabled && !isAdmin) throw new HttpsError("permission-denied", "Access plan disabled.");
  return { uid: request.auth.uid, profile, planId, plan, isAdmin };
}

export function canUseFeature(access, featureKey) {
  return access.isAdmin || hasEntitlementFeature(access.plan, featureKey);
}

export function accessLimit(access, key) {
  return access.isAdmin ? null : getEntitlementLimit(access.plan, key);
}
