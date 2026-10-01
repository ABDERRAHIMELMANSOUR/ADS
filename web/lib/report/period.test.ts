import { describe, expect, it } from "vitest";

import { parsePeriod } from "./period";

describe("parsePeriod", () => {
  it.each([
    ["September 1, 2026 - September 30, 2026", "2026-09-01", "2026-09-30"],
    ["1 septembre 2026 - 30 septembre 2026", "2026-09-01", "2026-09-30"],
    ["1er sept. 2026 – 30 sept. 2026", "2026-09-01", "2026-09-30"],
    ["Dec 15, 2025 - Jan 14, 2026", "2025-12-15", "2026-01-14"],
    ["1 févr. 2026 - 28 févr. 2026", "2026-02-01", "2026-02-28"],
    ["1 août 2026 - 31 août 2026", "2026-08-01", "2026-08-31"],
  ])("%s", (text, from, to) => {
    expect(parsePeriod(text)).toEqual({ text, from, to });
  });

  it("keeps the text when the dates cannot be read", () => {
    expect(parsePeriod("All time - 2026")).toEqual({ text: "All time - 2026", from: null, to: null });
  });
});
