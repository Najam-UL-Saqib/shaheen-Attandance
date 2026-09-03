import { describe, it, expect } from "vitest";
import {
  dateToDay,
  DAY_NAMES,
  DEFAULT_WORKING_DAYS,
  DEFAULT_PERIODS_PER_DAY,
  DEFAULT_BREAK_AFTER_PERIOD,
} from "./schedule";

describe("dateToDay", () => {
  it("maps Monday to 1 and Sunday to 7 (app convention)", () => {
    expect(dateToDay("2026-09-07")).toBe(1); // Monday
    expect(dateToDay("2026-09-08")).toBe(2); // Tuesday
    expect(dateToDay("2026-09-12")).toBe(6); // Saturday
    expect(dateToDay("2026-09-13")).toBe(7); // Sunday
  });

  it("DAY_NAMES lines up with the 1..7 convention", () => {
    expect(DAY_NAMES[dateToDay("2026-09-07")]).toBe("Mon");
    expect(DAY_NAMES[dateToDay("2026-09-13")]).toBe("Sun");
  });
});

describe("schedule fallback defaults", () => {
  it("match the school_settings column defaults", () => {
    expect(DEFAULT_WORKING_DAYS).toBe(5);
    expect(DEFAULT_PERIODS_PER_DAY).toBe(8); // DB default is 8, not 6
    expect(DEFAULT_BREAK_AFTER_PERIOD).toBe(0);
  });
});
