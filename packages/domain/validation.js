/**
 * Validation primitives. All Firestore writes route through validators that
 * mirror firestore.rules. Domain schemas compose these primitives.
 */

export function isString(value, maxLength = 200) {
  return typeof value === "string" && value.length <= maxLength;
}

export function isNonEmptyString(value, maxLength = 200) {
  return isString(value, maxLength) && value.trim().length > 0;
}

export function isNullableString(value, maxLength = 200) {
  return value === null || value === undefined || isNonEmptyString(value, maxLength);
}

export function isBoolean(value) {
  return typeof value === "boolean";
}

export function isInteger(value, { min = -2147483648, max = 2147483647 } = {}) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function isNullableInteger(value, options) {
  return value === null || value === undefined || isInteger(value, options);
}

export function isOneOf(value, allowed) {
  return allowed.includes(value);
}

export function isNullableOneOf(value, allowed) {
  return value === null || value === undefined || isOneOf(value, allowed);
}

/**
 * Validate a payload against a schema of `field -> validator`.
 * Returns the first invalid field name, or null when valid.
 */
export function validateFields(data, schema) {
  for (const [field, validate] of Object.entries(schema)) {
    if (!validate(data?.[field])) {
      return field;
    }
  }
  return null;
}
