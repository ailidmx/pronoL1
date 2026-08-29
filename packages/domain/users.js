/**
 * User profile domain (users/{uid} — see docs/rearchitecture-plan.md §4).
 * Email/password is handled by Firebase Auth; this is the Firestore profile.
 */
import {
  isNonEmptyString,
  isBoolean,
  isNullableString,
  isNullableInteger,
  validateFields,
} from "./validation.js";
import { buildPayload } from "./payload-builders.js";

export const USER_PROFILE_FIELDS = {
  email: isNonEmptyString,
  displayName: isNullableString,
  avatarInitiales: isNullableString,
  equipeCoeurId: isNullableInteger,
  isAdmin: isBoolean,
  isAllowed: isBoolean,
  notifEmail: isBoolean,
  notifPush: isBoolean,
  notifTelegram: isBoolean,
  telegramChatId: isNullableString,
};

export const DEFAULT_USER_PROFILE = {
  displayName: null,
  avatarInitiales: null,
  equipeCoeurId: null,
  isAdmin: false,
  isAllowed: false,
  notifEmail: true,
  notifPush: false,
  notifTelegram: false,
  telegramChatId: null,
};

export function validateUserProfile(data) {
  return validateFields(data, USER_PROFILE_FIELDS);
}

export function buildUserProfilePayload(fields, options) {
  return buildPayload(fields, { schema: USER_PROFILE_FIELDS, ...options });
}

// Fields a user may edit on their own profile (pseudo, favorite team, notif
// prefs). `isAdmin` and `email` are deliberately NOT here — callers must pick
// these fields explicitly so a user can never self-grant admin.
export const PROFILE_EDITABLE_FIELDS = {
  displayName: isNullableString,
  equipeCoeurId: isNullableInteger,
  notifEmail: isBoolean,
  notifPush: isBoolean,
  notifTelegram: isBoolean,
};

export function validateProfileEdit(data) {
  return validateFields(data, PROFILE_EDITABLE_FIELDS);
}

export function buildProfileEditPayload(fields, options) {
  return buildPayload(fields, { schema: PROFILE_EDITABLE_FIELDS, ...options });
}

// Derive avatar initials from a display name (up to 2 words), e.g. "David Aïli"
// → "DA". Returns null when there is nothing usable.
export function initialsFromName(name) {
  if (!name || !name.trim()) return null;
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => (p[0] ?? "").toUpperCase());
  return letters.join("") || null;
}
