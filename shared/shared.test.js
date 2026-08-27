import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collections,
  paths,
  isNonEmptyString,
  validateFields,
  buildPayload,
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
