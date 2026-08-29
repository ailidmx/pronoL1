import { getDefaultAccessPlan, resolveProfileAccessPlanId, collections } from "@prono-l1/domain";

export async function getUserAccessContext(db, uid) {
  const profileSnap = await db.collection(collections.users).doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data() : null;

  if (profile?.isAdmin === true) {
    return { profile, plan: getDefaultAccessPlan("premium"), planId: "admin" };
  }

  const planId = resolveProfileAccessPlanId(profile);
  const planSnap = await db.collection(collections.accessPlans).doc(planId).get();
  const plan = planSnap.exists
    ? { id: planSnap.id, ...planSnap.data() }
    : getDefaultAccessPlan(planId);

  return { profile, plan, planId };
}
