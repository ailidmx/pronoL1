import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collections,
  paths,
  isNonEmptyString,
  validateFields,
  buildPayload,
  validateUserProfile,
  DEFAULT_USER_PROFILE,
  validateProfileEdit,
  buildProfileEditPayload,
  initialsFromName,
  validatePronostic,
  isValidPronosticScores,
  buildPronosticPayload,
  decomposePoints,
  computePronosticPoints,
  DEFAULT_BAREME,
  buildLeaderboard,
  validateBonusAnswer,
  validateBonusAnswerForQuestion,
  computeBonusPointsPerPick,
  validateQuizAnswer,
} from "./index.js";

test("collection names are the single source of truth", () => {
  assert.equal(collections.users, "users");
  assert.equal(collections.matches, "matches");
  assert.equal(collections.quizWeeks, "quizWeeks");
});

test("path builders produce document paths", () => {
  assert.equal(paths.user("u1"), "users/u1");
  assert.equal(paths.match("m1"), "matches/m1");
  assert.equal(paths.pronostic("m1", "u1"), "matches/m1/pronostics/u1");
});

test("validation primitives behave", () => {
  assert.equal(isNonEmptyString("ok"), true);
  assert.equal(isNonEmptyString("  "), false);
  assert.equal(isNonEmptyString(123), false);
});

test("validateFields returns the first invalid field", () => {
  const schema = { name: isNonEmptyString };
  assert.equal(validateFields({ name: "ok" }, schema), null);
  assert.equal(validateFields({ name: "" }, schema), "name");
});

test("buildPayload validates and stamps metadata", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const payload = buildPayload(
    { name: "Prono-L1" },
    { schema: { name: isNonEmptyString }, sourceHost: "test", now },
  );
  assert.equal(payload.name, "Prono-L1");
  assert.equal(payload.sourceHost, "test");
  assert.equal(payload.updatedAt, now);

  assert.throws(() => buildPayload({ name: "" }, { schema: { name: isNonEmptyString } }));
});

test("user profile validation", () => {
  const valid = {
    email: "a@example.com",
    displayName: "Doc",
    avatarInitiales: "DO",
    equipeCoeurId: null,
    isAdmin: false,
    isAllowed: false,
    isPremium: false,
    notifEmail: true,
    notifPush: false,
    notifTelegram: false,
    telegramChatId: null,
  };
  assert.equal(validateUserProfile(valid), null);
  assert.equal(validateUserProfile({ ...valid, email: "" }), "email");
  assert.equal(validateUserProfile({ ...valid, isAdmin: "yes" }), "isAdmin");
  assert.equal(validateUserProfile({ ...valid, isAllowed: "yes" }), "isAllowed");
  assert.equal(validateUserProfile({ ...valid, isPremium: "yes" }), "isPremium");
});

test("default user profile is safe", () => {
  assert.equal(DEFAULT_USER_PROFILE.isAdmin, false);
  assert.equal(DEFAULT_USER_PROFILE.isAllowed, true);
  assert.equal(DEFAULT_USER_PROFILE.isPremium, false);
  assert.equal(DEFAULT_USER_PROFILE.notifEmail, true);
});

test("profile edit validates editable fields", () => {
  const valid = {
    displayName: "Karla",
    equipeCoeurId: 85,
    notifEmail: true,
    notifPush: false,
    notifTelegram: false,
  };
  assert.equal(validateProfileEdit(valid), null);
  assert.equal(validateProfileEdit({ ...valid, notifEmail: undefined }), "notifEmail");
  assert.equal(validateProfileEdit({ ...valid, equipeCoeurId: "abc" }), "equipeCoeurId");
});

test("buildProfileEditPayload stamps and validates", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const payload = buildProfileEditPayload(
    { displayName: "Karla", equipeCoeurId: 85, notifEmail: true, notifPush: false, notifTelegram: false },
    { now },
  );
  assert.equal(payload.displayName, "Karla");
  assert.equal(payload.updatedAt, now);
  assert.throws(() => buildProfileEditPayload({ displayName: "Karla", equipeCoeurId: null }));
});

test("initialsFromName derives avatar initials", () => {
  assert.equal(initialsFromName("David Aïli"), "DA");
  assert.equal(initialsFromName("Karla"), "K");
  assert.equal(initialsFromName(null), null);
  assert.equal(initialsFromName("   "), null);
});

test("pronostic validation", () => {
  assert.equal(validatePronostic({ scoreDom: 2, scoreExt: 1 }), null);
  assert.equal(validatePronostic({ scoreDom: null, scoreExt: null }), null);
  assert.equal(validatePronostic({ scoreDom: -1, scoreExt: 1 }), "scoreDom");
  assert.equal(validatePronostic({ scoreDom: 100, scoreExt: 1 }), "scoreDom");
});

test("pronostic scores must be both set or both cleared", () => {
  assert.equal(isValidPronosticScores(2, 1), true);
  assert.equal(isValidPronosticScores(null, null), true);
  assert.equal(isValidPronosticScores(2, null), false);
  assert.equal(isValidPronosticScores(null, 1), false);
});

test("buildPronosticPayload validates and stamps", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const payload = buildPronosticPayload({ scoreDom: 2, scoreExt: 0 }, { sourceHost: "test", now });
  assert.equal(payload.scoreDom, 2);
  assert.equal(payload.updatedAt, now);
  assert.throws(() => buildPronosticPayload({ scoreDom: 999, scoreExt: 0 }));
});

test("scoring: exact score", () => {
  const d = decomposePoints(DEFAULT_BAREME, 2, 1, 2, 1);
  assert.equal(d.total, 5);
  assert.equal(d.resultat, "exact");
  assert.equal(d.exact, 5);
});

test("scoring: correct result + correct goal difference", () => {
  const d = decomposePoints(DEFAULT_BAREME, 3, 1, 2, 0);
  assert.equal(d.resultat, "bon");
  assert.equal(d.bonResultat, 2);
  assert.equal(d.bonusEcart, 1);
  assert.equal(d.total, 3);
});

test("scoring: correct result, wrong goal difference", () => {
  const d = decomposePoints(DEFAULT_BAREME, 3, 1, 2, 1);
  assert.equal(d.resultat, "bon");
  assert.equal(d.bonResultat, 2);
  assert.equal(d.bonusEcart, 0);
  assert.equal(d.bonusButsExt, 1);
  assert.equal(d.total, 3);
});

test("scoring: wrong result but correct home goals (independent)", () => {
  const d = decomposePoints(DEFAULT_BAREME, 2, 1, 2, 3);
  assert.equal(d.resultat, "mauvais");
  assert.equal(d.bonusButsDom, 1);
  assert.equal(d.total, 1);
});

test("scoring: wrong result but correct away goals (independent)", () => {
  const d = decomposePoints(DEFAULT_BAREME, 1, 1, 0, 1);
  assert.equal(d.resultat, "mauvais");
  assert.equal(d.bonusButsExt, 1);
  assert.equal(d.total, 1);
});

test("computePronosticPoints returns the total", () => {
  assert.equal(computePronosticPoints(2, 1, 2, 1), 5);
  assert.equal(computePronosticPoints(1, 1, 2, 0), 0);
  assert.equal(computePronosticPoints(1, 1, 2, 1), 1);
});

test("leaderboard shares rank on ties", () => {
  const rows = buildLeaderboard([
    { userId: "a", points: 3 },
    { userId: "b", points: 3 },
    { userId: "c", points: 1 },
  ]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3]);
});

test("bonus answer validates shape", () => {
  assert.equal(validateBonusAnswer({ clubIds: [85], playerText: null }), null);
  assert.equal(validateBonusAnswer({ clubIds: [], playerText: "Esteban Lepaul" }), null);
  assert.equal(validateBonusAnswer({ clubIds: "85", playerText: null }), "clubIds");
  assert.equal(validateBonusAnswer({ clubIds: [85], playerText: 7 }), "playerText");
});

test("bonus answer validates against the question type", () => {
  const club = { type: "club", nbChoix: 1 };
  assert.equal(validateBonusAnswerForQuestion(club, { clubIds: [85], playerText: null }), null);
  assert.equal(validateBonusAnswerForQuestion(club, { clubIds: [85, 63], playerText: null }), "clubIds");

  const multi = { type: "multi_club", nbChoix: 2 };
  assert.equal(validateBonusAnswerForQuestion(multi, { clubIds: [85, 63], playerText: null }), null);
  assert.equal(validateBonusAnswerForQuestion(multi, { clubIds: [85, 85], playerText: null }), "clubIds");

  const joueur = { type: "joueur", nbChoix: 1 };
  assert.equal(validateBonusAnswerForQuestion(joueur, { clubIds: [], playerText: "X" }), null);
  assert.equal(validateBonusAnswerForQuestion(joueur, { clubIds: [], playerText: null }), "playerText");
});

test("bonus points per pick is truncated points/nbChoix", () => {
  assert.equal(computeBonusPointsPerPick({ points: 15, nbChoix: 1 }), 15);
  assert.equal(computeBonusPointsPerPick({ points: 15, nbChoix: 2 }), 7);
});

test("quiz answer validates optionId", () => {
  assert.equal(validateQuizAnswer({ optionId: "41" }), null);
  assert.equal(validateQuizAnswer({ optionId: 41 }), "optionId");
  assert.equal(validateQuizAnswer({ optionId: "abc" }), "optionId");
});
