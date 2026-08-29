import { randomBytes } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  collections,
  DEFAULT_COMPETITION_KEY,
  normalizeCommunityName,
  normalizeCompetitionKeys,
  normalizeInviteCode,
  validateCommunityInput,
} from "@prono-l1/domain";
import { accessLimit, canUseFeature, loadRequestAccess } from "./access.js";

const db = getFirestore();

function membershipId(communityId, uid) {
  return `${communityId}_${uid}`;
}

function createInviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

function enforceLimits(access, memberships, competitionIds, extraCommunities = 1) {
  const maxCommunities = accessLimit(access, "maxCommunities");
  if (maxCommunities !== null && memberships.size + extraCommunities > maxCommunities) {
    throw new HttpsError("resource-exhausted", "Community limit reached for this access plan.");
  }
  const activeCompetitions = new Set();
  memberships.docs.forEach((doc) => (doc.data().competitionIds ?? []).forEach((id) => activeCompetitions.add(id)));
  competitionIds.forEach((id) => activeCompetitions.add(id));
  const maxCompetitions = accessLimit(access, "maxCompetitions");
  if (maxCompetitions !== null && activeCompetitions.size > maxCompetitions) {
    throw new HttpsError("resource-exhausted", "Competition limit reached for this access plan.");
  }
}

export const getCommunities = onCall({ cors: true }, async (request) => {
  const access = await loadRequestAccess(db, request);
  if (!canUseFeature(access, "communities")) throw new HttpsError("permission-denied", "Communities entitlement required.");
  const memberships = await db.collection(collections.communityMemberships).where("userId", "==", access.uid).get();
  const communitySnaps = memberships.empty
    ? []
    : await db.getAll(...memberships.docs.map((membership) => db.collection(collections.communities).doc(membership.data().communityId)));
  const byId = new Map(communitySnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()]));
  const communities = memberships.docs.flatMap((membership) => {
    const data = membership.data();
    const community = byId.get(data.communityId);
    if (!community) return [];
    return [{
      id: data.communityId,
      name: community.name,
      role: data.role ?? "member",
      invitationCode: data.role === "owner" ? community.invitationCode ?? null : null,
      competitionIds: community.competitionIds ?? [],
      memberCount: community.memberCount ?? 1,
    }];
  });
  return {
    communities,
    planId: access.planId,
    isAdmin: access.isAdmin,
    limits: {
      maxCommunities: accessLimit(access, "maxCommunities"),
      maxCompetitions: accessLimit(access, "maxCompetitions"),
    },
    defaultCompetitionId: DEFAULT_COMPETITION_KEY,
  };
});

export const createCommunity = onCall({ cors: true }, async (request) => {
  const access = await loadRequestAccess(db, request);
  if (!canUseFeature(access, "communities")) throw new HttpsError("permission-denied", "Communities entitlement required.");
  const name = normalizeCommunityName(request.data?.name);
  const competitionIds = normalizeCompetitionKeys(request.data?.competitionIds ?? [DEFAULT_COMPETITION_KEY]);
  const invalid = validateCommunityInput({ name, competitionIds });
  if (invalid) throw new HttpsError("invalid-argument", `Invalid ${invalid}.`);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invitationCode = createInviteCode();
    const communityRef = db.collection(collections.communities).doc();
    const inviteRef = db.collection(collections.communityInvites).doc(invitationCode);
    const membershipRef = db.collection(collections.communityMemberships).doc(membershipId(communityRef.id, access.uid));
    try {
      await db.runTransaction(async (transaction) => {
        const membershipQuery = db.collection(collections.communityMemberships).where("userId", "==", access.uid);
        const [memberships, invite] = await Promise.all([transaction.get(membershipQuery), transaction.get(inviteRef)]);
        if (invite.exists) throw new Error("invite-collision");
        enforceLimits(access, memberships, competitionIds, 1);
        transaction.set(communityRef, {
          name,
          ownerId: access.uid,
          invitationCode,
          competitionIds,
          memberCount: 1,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(inviteRef, { communityId: communityRef.id, active: true, createdAt: FieldValue.serverTimestamp() });
        transaction.set(membershipRef, {
          communityId: communityRef.id,
          userId: access.uid,
          role: "owner",
          competitionIds,
          joinedAt: FieldValue.serverTimestamp(),
        });
      });
      return { id: communityRef.id, name, invitationCode, competitionIds };
    } catch (error) {
      if (error instanceof Error && error.message === "invite-collision") continue;
      throw error;
    }
  }
  throw new HttpsError("aborted", "Could not allocate an invitation code. Try again.");
});

export const joinCommunity = onCall({ cors: true }, async (request) => {
  const access = await loadRequestAccess(db, request);
  if (!canUseFeature(access, "communities")) throw new HttpsError("permission-denied", "Communities entitlement required.");
  const code = normalizeInviteCode(request.data?.code);
  if (code.length < 6) throw new HttpsError("invalid-argument", "Invalid invitation code.");
  const inviteRef = db.collection(collections.communityInvites).doc(code);

  return db.runTransaction(async (transaction) => {
    const invite = await transaction.get(inviteRef);
    if (!invite.exists || invite.data()?.active !== true) throw new HttpsError("not-found", "Invitation not found.");
    const communityId = invite.data().communityId;
    const communityRef = db.collection(collections.communities).doc(communityId);
    const membershipRef = db.collection(collections.communityMemberships).doc(membershipId(communityId, access.uid));
    const membershipQuery = db.collection(collections.communityMemberships).where("userId", "==", access.uid);
    const [community, existing, memberships] = await Promise.all([
      transaction.get(communityRef),
      transaction.get(membershipRef),
      transaction.get(membershipQuery),
    ]);
    if (!community.exists || community.data()?.active !== true) throw new HttpsError("not-found", "Community not found.");
    if (existing.exists) return { id: communityId, alreadyMember: true };
    const competitionIds = normalizeCompetitionKeys(community.data()?.competitionIds ?? []);
    enforceLimits(access, memberships, competitionIds, 1);
    transaction.set(membershipRef, {
      communityId,
      userId: access.uid,
      role: "member",
      competitionIds,
      joinedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(communityRef, {
      memberCount: Math.max(1, Number(community.data()?.memberCount ?? 1)) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: communityId, name: community.data()?.name ?? "Communauté", competitionIds };
  });
});

export const leaveCommunity = onCall({ cors: true }, async (request) => {
  const access = await loadRequestAccess(db, request);
  const communityId = typeof request.data?.communityId === "string" ? request.data.communityId.trim() : "";
  if (!communityId) throw new HttpsError("invalid-argument", "communityId is required.");
  const communityRef = db.collection(collections.communities).doc(communityId);
  const membershipRef = db.collection(collections.communityMemberships).doc(membershipId(communityId, access.uid));
  await db.runTransaction(async (transaction) => {
    const [community, membership] = await Promise.all([transaction.get(communityRef), transaction.get(membershipRef)]);
    if (!membership.exists) return;
    if (membership.data()?.role === "owner") {
      throw new HttpsError("failed-precondition", "The owner must transfer or dissolve the community before leaving.");
    }
    transaction.delete(membershipRef);
    if (community.exists) {
      transaction.update(communityRef, {
        memberCount: Math.max(1, Number(community.data()?.memberCount ?? 1) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return { ok: true };
});
