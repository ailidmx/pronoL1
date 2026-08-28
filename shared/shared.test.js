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
  validatePronostic,
  isValidPronosticScores,
  buildPronosticPayload,
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
    notifEmail: true,
    notifPush: false,
    notifTelegram: false,
    telegramChatId: null,
  };
  assert.equal(validateUserProfile(valid), null);
  assert.equal(validateUserProfile({ ...valid, email: "" }), "email");
  assert.equal(validateUserProfile({ ...valid, isAdmin: "yes" }), "isAdmin");
});

test("default user profile is safe", () => {
  assert.equal(DEFAULT_USER_PROFILE.isAdmin, false);
  assert.equal(DEFAULT_USER_PROFILE.notifEmail, true);
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
