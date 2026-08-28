import { describe, expect, it } from "vitest";
import { assignVariant } from "./assign";

const experiment = {
  key: "test",
  enabled: true,
  variants: [{ key: "a", weight: 50 }, { key: "b", weight: 50 }],
} as const;

describe("assignVariant", () => {
  it("keeps an assignment stable", () => {
    expect(assignVariant(experiment, "visitor-1", "salt"))
      .toEqual(assignVariant(experiment, "visitor-1", "salt"));
  });

  it("returns control for a disabled experiment", () => {
    expect(assignVariant({ ...experiment, enabled: false }, "visitor-1").variant).toBe("control");
  });
});
