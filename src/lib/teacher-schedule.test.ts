import { describe, it, expect } from "vitest";
import {
  wouldExceedConsecutiveTeachingLimit,
  MAX_CONSECUTIVE_TEACHING_PERIODS,
} from "./teacher-schedule";

describe("wouldExceedConsecutiveTeachingLimit", () => {
  it("defaults to a limit of 3", () => {
    expect(MAX_CONSECUTIVE_TEACHING_PERIODS).toBe(3);
  });

  it("allows a 3rd consecutive period at the default limit", () => {
    expect(wouldExceedConsecutiveTeachingLimit([1, 2], 3)).toBe(false);
  });

  it("blocks a 4th consecutive period at the default limit", () => {
    expect(wouldExceedConsecutiveTeachingLimit([1, 2, 3], 4)).toBe(true);
  });

  it("blocks when the candidate sits in the middle of an existing run", () => {
    expect(wouldExceedConsecutiveTeachingLimit([1, 2, 4, 5], 3)).toBe(true);
  });

  it("allows non-adjacent periods", () => {
    expect(wouldExceedConsecutiveTeachingLimit([1, 3, 5, 7], 2)).toBe(false);
  });

  it("is order-independent and de-dupes", () => {
    expect(wouldExceedConsecutiveTeachingLimit([3, 1, 2, 2], 4)).toBe(true);
    expect(wouldExceedConsecutiveTeachingLimit([5, 2, 1], 3)).toBe(false);
  });

  it("accepts a custom limit (configurable setting)", () => {
    // limit 2: a 3rd back-to-back period is not allowed
    expect(wouldExceedConsecutiveTeachingLimit([1, 2], 3, 2)).toBe(true);
    expect(wouldExceedConsecutiveTeachingLimit([1], 2, 2)).toBe(false);
    // limit 5: four in a row is fine
    expect(wouldExceedConsecutiveTeachingLimit([1, 2, 3], 4, 5)).toBe(false);
    expect(wouldExceedConsecutiveTeachingLimit([1, 2, 3, 4, 5], 6, 5)).toBe(true);
  });

  it("handles an empty schedule", () => {
    expect(wouldExceedConsecutiveTeachingLimit([], 1)).toBe(false);
  });

  it("accepts a Set as input", () => {
    expect(wouldExceedConsecutiveTeachingLimit(new Set([1, 2, 3]), 4)).toBe(true);
  });
});
