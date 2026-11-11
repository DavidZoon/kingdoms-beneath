import { describe, expect, it } from "vitest";
import { getCrackSegments } from "./blockCracks";

describe("centre-out material cracks", () => {
  it("starts at the centre, grows with damage and stays inside the tile", () => {
    expect(getCrackSegments(0)).toEqual([]);
    const early = getCrackSegments(0.1);
    expect(early).toHaveLength(4);
    for (const segment of early) expect(segment.from).toEqual([16, 16]);
    const later = getCrackSegments(0.9);
    const length = (progress: number): number => getCrackSegments(progress)
      .reduce((sum, segment) => sum + Math.hypot(
        segment.to[0] - segment.from[0], segment.to[1] - segment.from[1],
      ), 0);
    expect(length(0.9)).toBeGreaterThan(length(0.1));
    for (const segment of later) {
      for (const coordinate of [...segment.from, ...segment.to]) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(32);
      }
    }
  });
});
