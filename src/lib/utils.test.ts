import { describe, it, expect } from "vitest";
import { cn, naturalCompare } from "./utils";

describe("naturalCompare", () => {
  it("sorts numeric class names in numeric order", () => {
    const names = ["10", "2", "1", "11", "9"];
    expect([...names].sort(naturalCompare)).toEqual(["1", "2", "9", "10", "11"]);
  });

  it("sorts non-numeric names alphabetically, case-insensitively", () => {
    expect([...["Urdu", "english", "Biology"]].sort(naturalCompare)).toEqual([
      "Biology",
      "english",
      "Urdu",
    ]);
  });

  it("orders class-section labels naturally", () => {
    const labels = ["10-A", "2-B", "2-A", "10-B", "1-A"];
    expect([...labels].sort(naturalCompare)).toEqual(["1-A", "2-A", "2-B", "10-A", "10-B"]);
  });
});

describe("cn", () => {
  it("merges tailwind classes with later ones winning", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});
