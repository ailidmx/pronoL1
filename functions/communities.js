import { randomBytes } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  collections,
  hasEntitlementFeature,
  isWithinEntitlementLimit,
  paths,
} from "@prono-l1/domain";
import { getUserAccessContext } from "./access.js";

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  return request.auth.uid;
}

function cleanName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 60) {
    throw new HttpsError("invalid-argument", "Community name must contain 3 to 60 characters.");
  }
  return name;
}

function cleanCompetitionId(value) {
  const competitionId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{2,40}$/.test(competitionId)) {
    throw new HttpsError("invalid-argument", "Invalid competitionId.");
  }
  return competitionId;
}

function cleanSeasonId(value) {
  const seasonId = Number(value);
  if (!Number.isInteger(seasonId) || seasonId < 2000 || seasonId > 2200) {
    throw new HttpsError("invalid-argument", "Invalid seasonId.");
  }
  return seasonId;
}

function normalizeInviteCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (code.length < 6 || code.length > 16) {
    throw new HttpsError("invalid-argument", "Invalid invitation code.");
  }
  return code;
}

function makeInviteCode() {
  return randomBytes(7).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
}

function assertCommunityAccess(plan) {
  if (!hasEntitlementFeature(plan, "communities")) {
    throw new HttpsError("permission-denied", "Your access plan does not include communities.");
  }
}

function usageFromMemberships(snapshot) {
  const communities = new Set();
  const competitions = new Set();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.communityId) communities.add(String(data.communityId));
    if (data.competitionId) competitions.add(String(data.competitionId));
  }
  return { communities, competitions };
}

function assertUsageWithinPlan(plan, usage, competitionId, communityIncrement = 1) {
  if (!isWithinEntitlementLimit(plan, "maxCommunities", usage.communities.size, communityIncrement)) {
    throw new HttpsError("resource-exhausted", "Community limit reached for this access plan.");
  }
  const competitionIncrement = usage.competitions.has(competitionId) ? 0 : 1;
  if (!isWithinEntitlementLimit(plan, "maxCompetitions", usage.competitions.size, competitionIncrement)) {
    throw new HttpsError("resource-exhausted", "Competition limit reached for this access plan.");
  }
}

async function uniqueInviteCode(db) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = makeInviteCode();
    const existing = await db.collection(collections.communities).where("inviteCode", "==", inviteCode).limit(1).get();
    if (existing.empty) return inviteCode;
  }
  throw new HttpsError("internal", "Unable to generate a unique invitation code.");
}

export const createCommunity = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const name = cleanName(request.data?.name);
  const competitionId = cleanCompetitionId(request.data?.competitionId ?? "ligue-1");
  const seasonId = cleanSeasonId(request.data?.seasonId ?? 2026);
  const db = getFirestore();
  const { plan } = await getUserAccessContext(db, uid);
  assertCommunityAccess(plan);

  const inviteCode = await uniqueInviteCode(db);
  const communityRef = db.collection(collections.communities).doc();
  const memberRef = db.doc(paths.communityMember(communityRef.id, uid));
  const membershipRef = db.doc(paths.communityMembership(communityRef.id, uid));
  const membershipsQuery = db.collection(collections.communityMemberships).where("userId", "==", uid);

  await db.runTransaction(async (transaction) => {
    const memberships = await transaction.get(membershipsQuery);
    const usage = usageFromMemberships(memberships);
    assertUsageWithinPlan(plan, usage, competitionId);

    transaction.create(communityRef, {
      name,
      ownerId: uid,
      competitionId,
      seasonId,
      inviteCode,
      memberCount: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(memberRef, {
      userId: uid,
      role: "owner",
      joinedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(membershipRef, {
      communityId: communityRef.id,
      userId: uid,
      role: "owner",
      competitionId,
      seasonId,
      joinedAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    ok: true,
    community: { id: communityRef.id, name, competitionId, seasonId, inviteCode, role: "owner" },
  };
});

export const joinCommunity = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const inviteCode = normalizeInviteCode(request.data?.inviteCode);
  const db = getFirestore();
  const { plan } = await getUserAccessContext(db, uid);
  assertCommunityAccess(plan);

  const communityLookup = await db.collection(collections.communities).where("inviteCode", "==", inviteCode).limit(1).get();
  if (communityLookup.empty) throw new HttpsError("not-found", "Community not found.");
  const communitySnap = communityLookup.docs[0];
  const community = communitySnap.data();
  const communityId = communitySnap.id;
  const competitionId = cleanCompetitionId(community.competitionId);
  const seasonId = cleanSeasonId(community.seasonId);
  const memberRef = db.doc(paths.communityMember(communityId, uid));
  const membershipRef = db.doc(paths.communityMembership(communityId, uid));
  const membershipsQuery = db.collection(collections.communityMemberships).where("userId", "==", uid);

  await db.runTransaction(async (transaction) => {
    const currentMembership = await transaction.get(membershipRef);
    if (currentMembership.exists) return;

    const memberships = await transaction.get(membershipsQuery);
    const usage = usageFromMemberships(memberships);
    assertUsageWithinPlan(plan, usage, competitionId);

    transaction.set(memberRef, {
      userId: uid,
      role: "member",
      joinedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(membershipRef, {
      communityId,
      userId: uid,
      role: "member",
      competitionId,
      seasonId,
      joinedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(communitySnap.ref, {
      memberCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, community: { id: communityId, name: community.name, competitionId, seasonId, role: "member" } };
});

export const listMyCommunities = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const db = getFirestore();
  const { plan, planId } = await getUserAccessContext(db, uid);
  assertCommunityAccess(plan);

  const memberships = await db.collection(collections.communityMemberships).where("userId", "==", uid).get();
  const rows = await Promise.all(memberships.docs.map(async (membershipDoc) => {
    const membership = membershipDoc.data();
    const communitySnap = await db.collection(collections.communities).doc(String(membership.communityId)).get();
    if (!communitySnap.exists) return null;
    const community = communitySnap.data();
    return {
      id: communitySnap.id,
      name: community.name,
      role: membership.role,
      competitionId: membership.competitionId,
      seasonId: membership.seasonId,
      inviteCode: membership.role === "owner" ? community.inviteCode : null,
      memberCount: community.memberCount ?? null,
    };
  }));

  const usage = usageFromMemberships(memberships);
  return {
    planId,
    limits: plan?.limits ?? {},
    usage: { communities: usage.communities.size, competitions: usage.competitions.size },
    communities: rows.filter(Boolean),
  };
});

export const leaveCommunity = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const communityId = typeof request.data?.communityId === "string" ? request.data.communityId.trim() : "";
  if (!communityId) throw new HttpsError("invalid-argument", "communityId is required.");

  const db = getFirestore();
  const communityRef = db.collection(collections.communities).doc(communityId);
  const memberRef = db.doc(paths.communityMember(communityId, uid));
  const membershipRef = db.doc(paths.communityMembership(communityId, uid));

  await db.runTransaction(async (transaction) => {
    const [communitySnap, membershipSnap] = await Promise.all([
      transaction.get(communityRef),
      transaction.get(membershipRef),
    ]);
    if (!communitySnap.exists || !membershipSnap.exists) {
      throw new HttpsError("not-found", "Membership not found.");
    }
    if (communitySnap.data()?.ownerId === uid) {
      throw new HttpsError("failed-precondition", "The owner cannot leave before transferring or dissolving the community.");
    }
    transaction.delete(memberRef);
    transaction.delete(membershipRef);
    transaction.update(communityRef, {
      memberCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});
