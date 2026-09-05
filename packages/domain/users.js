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

export const NOTIFICATION_TOPICS = ["results", "predictionReminders", "quizBonus", "announcements"];
export const NOTIFICATION_CHANNELS = ["email", "telegram", "push"];

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.fromEntries(
  NOTIFICATION_TOPICS.map((topic) => [topic, Object.fromEntries(NOTIFICATION_CHANNELS.map((channel) => [channel, false]))]),
);

function isNotificationPreferences(value) {
  return value != null && typeof value === "object" && !Array.isArray(value)
    && NOTIFICATION_TOPICS.every((topic) => value[topic] != null
      && typeof value[topic] === "object"
      && NOTIFICATION_CHANNELS.every((channel) => typeof value[topic][channel] === "boolean"));
}

export const USER_PROFILE_FIELDS = {
  email: isNonEmptyString,
  displayName: isNullableString,
  avatarInitiales: isNullableString,
  equipeCoeurId: isNullableInteger,
  isAdmin: isBoolean,
  isAllowed: isBoolean,
  isPremium: isBoolean,
  accessPlanId: isNullableString,
  notifEmail: isBoolean,
  notifPush: isBoolean,
  notifTelegram: isBoolean,
  telegramChatId: isNullableString,
  notificationPreferences: isNotificationPreferences,
};

export const DEFAULT_USER_PROFILE = {
  displayName: null,
  avatarInitiales: null,
  equipeCoeurId: null,
  isAdmin: false,
  isAllowed: true,
  isPremium: false,
  accessPlanId: "registered",
  notifEmail: true,
  notifPush: false,
  notifTelegram: false,
  telegramChatId: null,
  notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
};

export function validateUserProfile(data) {
  return validateFields(data, USER_PROFILE_FIELDS);
}

export function buildUserProfilePayload(fields, options) {
  return buildPayload(fields, { schema: USER_PROFILE_FIELDS, ...options });
}

export const PROFILE_EDITABLE_FIELDS = {
  displayName: isNullableString,
  equipeCoeurId: isNullableInteger,
  notifEmail: isBoolean,
  notifPush: isBoolean,
  notifTelegram: isBoolean,
  telegramChatId: isNullableString,
  avatarInitiales: isNullableString,
  notificationPreferences: isNotificationPreferences,
};

export function validateProfileEdit(data) {
  return validateFields(data, PROFILE_EDITABLE_FIELDS);
}

export function buildProfileEditPayload(fields, options) {
  return buildPayload(fields, { schema: PROFILE_EDITABLE_FIELDS, ...options });
}

export function initialsFromName(name) {
  if (!name || !name.trim()) return null;
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => (p[0] ?? "").toUpperCase());
  return letters.join("") || null;
}

export function normalizeAvatarInitiales(value, displayName) {
  const explicit = typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-ZÀ-ÖØ-Þ0-9]/g, "").slice(0, 2) : "";
  return explicit || initialsFromName(displayName);
}
