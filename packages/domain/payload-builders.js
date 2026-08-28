/**
 * Builders for Firestore write payloads. Every write goes through a builder so
 * timestamps / source host / shape stay consistent. Never spread raw form
 * state into Firestore — add a builder here and use it.
 */
import { validateFields } from "./validation.js";

/**
 * Build a payload: validate against a schema, stamp `updatedAt` (and optional
 * `sourceHost`). Throws if validation fails.
 */
export function buildPayload(fields, { schema, sourceHost, now = new Date() } = {}) {
  if (schema && typeof schema === "object") {
    const invalid = validateFields(fields, schema);
    if (invalid) {
      throw new Error(`Invalid payload field: ${invalid}`);
    }
  }
  const payload = { ...fields, updatedAt: now };
  if (sourceHost !== undefined) {
    payload.sourceHost = sourceHost;
  }
  return payload;
}

export function withTimestamps(payload, now = new Date()) {
  return { ...payload, updatedAt: now };
}

export function withSourceHost(payload, sourceHost) {
  return { ...payload, sourceHost };
}
