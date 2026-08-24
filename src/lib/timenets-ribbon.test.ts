import { describe, expect, it } from "vitest";
import { taperedTrajectoryRibbonPath } from "./timenets";

describe("TimeNets tapered trajectory ribbons", () => {
  it("matches endpoint membership widths without changing the centerline", () => {
    const path = taperedTrajectoryRibbonPath(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      1,
      0,
      4,
    );
    expect(path).toMatch(/^M 0 2\.75 /);
    expect(path).toContain("L 100 0.75 L 100 -0.75");
    expect(path).toMatch(/L 0 -2\.75 Z$/);
  });

  it("uses one neutral width when both endpoint strengths are unknown", () => {
    const path = taperedTrajectoryRibbonPath(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      null,
      null,
      2,
    );
    expect(path).toMatch(/^M 0 1\.25 /);
    expect(path).toMatch(/L 0 -1\.25 Z$/);
  });
});
