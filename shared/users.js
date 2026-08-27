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
