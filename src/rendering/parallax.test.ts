import { describe, expect, it } from "vitest";
import { WorldGenerator } from "../generation/WorldGenerator";
import { TILE_SIZE } from "../world/blocks";
import {
  backdropSurfaceY, foregroundPlantPosition, FOREGROUND_PLANT_SPACING, FOREGROUND_SCROLL_FACTOR,
} from "./parallax";

describe("stable parallax scenery", () => {
  it.each(["parallax-stability", "test", "forest"])("anchors the distant landscape to the seed %s", (seed) => {
    const generator = new WorldGenerator(seed, 3);
    const baseline = backdropSurfaceY(generator);
    expect(baseline).toBe(generator.surfaceAt(0) * TILE_SIZE);
    for (let column = -100; column <= 100; column++) {
      if (generator.surfaceAt(column) === generator.surfaceAt(column + 1)) continue;
      expect(backdropSurfaceY(generator)).toBe(baseline);
    }
  });

  it("does not move a plant vertically when its drawing position crosses a terrain step", () => {
    const generator = { surfaceAt: (column: number): number => column < 0 ? 28 : 29 };
    const before = foregroundPlantPosition(generator, 0, -0.001);
    const after = foregroundPlantPosition(generator, 0, 0.001);
    expect(before.x).toBeGreaterThan(0);
    expect(after.x).toBeLessThan(0);
    expect(generator.surfaceAt(Math.floor(before.x / TILE_SIZE))).not.toBe(
      generator.surfaceAt(Math.floor(after.x / TILE_SIZE)),
    );
    expect(before.groundY).toBe(29 * TILE_SIZE);
    expect(after.groundY).toBe(before.groundY);
  });

  it.each([-9, 0, 12])("keeps plant %s anchored while preserving its horizontal scroll factor", (index) => {
    const generator = new WorldGenerator("parallax-stability", 3);
    const anchorX = index * FOREGROUND_PLANT_SPACING / FOREGROUND_SCROLL_FACTOR;
    const expectedY = generator.surfaceAt(Math.floor(anchorX / TILE_SIZE)) * TILE_SIZE;
    for (const left of [-2048, -16, 0, 16, 2048]) {
      const before = foregroundPlantPosition(generator, index, left);
      const after = foregroundPlantPosition(generator, index, left + 32);
      expect(before.groundY).toBe(expectedY);
      expect(after.groundY).toBe(expectedY);
      expect((after.x - left - 32) - (before.x - left)).toBeCloseTo(-32 * FOREGROUND_SCROLL_FACTOR);
    }
  });
});
