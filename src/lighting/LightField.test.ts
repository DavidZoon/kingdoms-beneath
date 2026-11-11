import { describe, expect, it } from "vitest";
import { Block } from "../world/blocks";
import { WorldModel } from "../world/WorldModel";
import type { PlayerState } from "../player/PlayerController";
import {
  calculateLightField, carriedTorchSource, lightBrightness, sampleLight, sourceBrightness,
  TORCH_RADIUS, withLightSources,
} from "./LightField";

function chamber(boundary: number): WorldModel {
  const world = new WorldModel("lighting-test");
  for (let x = boundary - 12; x <= boundary + 12; x++) {
    for (let y = 48; y <= 72; y++) world.setBlock(x, y, Block.Stone);
  }
  for (let x = boundary - 7; x <= boundary + 7; x++) {
    for (let y = 53; y <= 67; y++) world.setBlock(x, y, Block.Air);
  }
  for (let y = 53; y <= 67; y++) world.setBlock(boundary, y, Block.Stone);
  return world;
}

describe("cellular light and occlusion", () => {
  it("does not alter sunlight or torchlight when a background wall is added", () => {
    const world = new WorldModel("lighting-test", [], 3);
    world.setBlock(8, 12, Block.Torch);
    const bounds = { minX: 8, maxX: 12, minY: 10, maxY: 14 };
    const before = calculateLightField(world, bounds);
    const foregroundRevision = world.foregroundRevision;
    world.setBackground(9, 12, Block.Stone);
    expect(world.foregroundRevision).toBe(foregroundRevision);
    const after = calculateLightField(world, bounds);
    expect(after.sky).toEqual(before.sky);
    expect(after.torch).toEqual(before.torch);
    world.setBlock(9, 12, Block.Stone);
    const blocked = calculateLightField(world, bounds);
    expect(sampleLight(blocked, 10, 12).torch).toBeLessThan(sampleLight(after, 10, 12).torch);
  });

  it.each([32, 0])("blocks a torch at the chunk boundary x=%s and updates after edits", (boundary) => {
    const world = chamber(boundary);
    const bounds = { minX: boundary - 1, maxX: boundary + 2, minY: 59, maxY: 61 };
    world.setBlock(boundary - 2, 60, Block.Torch);
    const blocked = calculateLightField(world, bounds);
    expect(sampleLight(blocked, boundary, 60).torch).toBeGreaterThan(0);
    expect(sampleLight(blocked, boundary + 1, 60)).toEqual({ sky: 0, torch: 0 });

    world.setBlock(boundary, 60, Block.Air);
    const open = calculateLightField(world, bounds);
    expect(sampleLight(open, boundary + 1, 60).torch).toBeGreaterThan(0);
    world.setBlock(boundary - 2, 60, Block.Air);
    expect(sampleLight(calculateLightField(world, bounds), boundary + 1, 60).torch).toBe(0);
  });

  it("includes sources just outside the viewport up to the torch radius", () => {
    const world = new WorldModel("lighting-test");
    world.setBlock(-TORCH_RADIUS + 1, 10, Block.Torch);
    const field = calculateLightField(world, { minX: 0, maxX: 1, minY: 10, maxY: 10 });
    expect(sampleLight(field, 0, 10).torch).toBeGreaterThan(0);
    expect(sampleLight(field, 1, 10).torch).toBe(0);
  });

  it("attenuates torchlight through leaves but transmits it through ladders", () => {
    const world = chamber(32);
    const bounds = { minX: 31, maxX: 34, minY: 59, maxY: 61 };
    world.setBlock(30, 60, Block.Torch);
    world.setBlock(32, 60, Block.Leaves);
    const throughLeaves = sampleLight(calculateLightField(world, bounds), 33, 60).torch;
    world.setBlock(32, 60, Block.Ladder);
    const throughLadder = sampleLight(calculateLightField(world, bounds), 33, 60).torch;
    expect(throughLeaves).toBeGreaterThan(0);
    expect(throughLeaves).toBeLessThan(throughLadder);
  });

  it("keeps illumination from other torches when one source is removed", () => {
    const world = chamber(32);
    const bounds = { minX: 31, maxX: 34, minY: 59, maxY: 61 };
    world.setBlock(30, 60, Block.Torch);
    world.setBlock(34, 60, Block.Torch);
    const both = sampleLight(calculateLightField(world, bounds), 33, 60).torch;
    world.setBlock(30, 60, Block.Air);
    expect(sampleLight(calculateLightField(world, bounds), 33, 60).torch).toBe(both);
    world.setBlock(34, 60, Block.Air);
    expect(sampleLight(calculateLightField(world, bounds), 33, 60).torch).toBe(0);
  });

  it("lets daylight reach exposed cells and attenuates or blocks it by material", () => {
    const world = new WorldModel("lighting-test");
    const bounds = { minX: 8, maxX: 8, minY: 7, maxY: 10 };
    for (let x = 0; x <= 16; x++) world.setBlock(x, 8, Block.Stone);
    let field = calculateLightField(world, bounds);
    expect(sampleLight(field, 8, 8).sky).toBe(1);
    expect(sampleLight(field, 8, 9).sky).toBe(0);
    world.setBlock(8, 8, Block.Leaves);
    field = calculateLightField(world, bounds);
    expect(sampleLight(field, 8, 9).sky).toBeCloseTo(0.65);
    world.setBlock(8, 8, Block.Ladder);
    field = calculateLightField(world, bounds);
    expect(sampleLight(field, 8, 9).sky).toBe(1);
    expect(lightBrightness(0, 0, 1)).toBeLessThan(lightBrightness(1, 0, 1));
    expect(lightBrightness(0, 1, 0.2)).toBe(1);
  });

  it("diffuses daylight around an isolated obstruction without passing through it", () => {
    const world = new WorldModel("lighting-test");
    world.setBlock(8, 8, Block.Stone);
    const field = calculateLightField(world, { minX: 8, maxX: 8, minY: 7, maxY: 10 });
    expect(sampleLight(field, 8, 9).sky).toBeGreaterThan(0);
    expect(sampleLight(field, 8, 9).sky).toBeLessThan(1);
  });

  it("rejects invalid bounds and out-of-field samples", () => {
    const world = new WorldModel("lighting-test");
    expect(() => calculateLightField(world, { minX: 0, maxX: 0, minY: 2, maxY: 1 })).toThrow(RangeError);
    const field = calculateLightField(world, { minX: 0, maxX: 0, minY: 1, maxY: 1 });
    expect(() => sampleLight(field, 100, 1)).toThrow(RangeError);
  });

  it.each([
    [0, 10, 1], [7, 10, 1], [7.5, 10, 1], [8.75, 10, 0.5],
    [9, 10, 0.4], [10, 10, 0], [11, 10, 0],
    [3, 4, 1], [3.5, 4, 0.5], [4, 4, 0],
  ])("uses the radial plateau and falloff at distance %s with range %s", (distance, range, expected) => {
    expect(sourceBrightness(distance, range)).toBeCloseTo(expected);
  });

  it("uses a circular ten-block halo rather than a Manhattan-distance diamond", () => {
    const world = new WorldModel("lighting-test");
    world.setBlock(8, 12, Block.Torch);
    const field = calculateLightField(world, { minX: -2, maxX: 18, minY: 2, maxY: 22 });
    expect(TORCH_RADIUS).toBe(10);
    expect(sampleLight(field, 13, 17).torch).toBe(1);
    expect(sampleLight(field, 14, 18).torch).toBeCloseTo(sourceBrightness(Math.hypot(6, 6), 10));
    expect(sampleLight(field, 17, 12).torch).toBeCloseTo(0.4);
    expect(sampleLight(field, 8, 21).torch).toBeCloseTo(0.4);
    expect(sampleLight(field, 14, 20).torch).toBe(0);
    expect(sampleLight(field, 18, 12).torch).toBe(0);
  });

  it("centers a selected torch on the player, follows movement, and switches off on deselection", () => {
    const world = new WorldModel("lighting-test");
    const player: PlayerState = {
      x: 8.5 * 16 - 6, y: 12.5 * 16 - 13,
      vx: 0, vy: 0, grounded: false, climbing: false,
    };
    const base = calculateLightField(world, { minX: 0, maxX: 35, minY: 10, maxY: 14 });
    const source = carriedTorchSource(player, "torch");
    expect(source).toEqual({ x: 8.5, y: 12.5, range: 10 });
    if (!source) throw new Error("Missing carried torch.");
    const carried = withLightSources(world, base, [source]);
    expect(sampleLight(carried, 8, 12).torch).toBe(1);
    expect(sampleLight(base, 8, 12).torch).toBe(0);

    player.x += 12 * 16 + 4;
    player.y += 2;
    const moved = carriedTorchSource(player, "torch");
    if (!moved) throw new Error("Missing moving torch.");
    expect(moved.x).toBe(20.75);
    expect(moved.y).toBe(12.625);
    const movingField = withLightSources(world, base, [moved]);
    expect(sampleLight(movingField, 8, 12).torch).toBe(0);
    expect(sampleLight(movingField, 20, 12).torch).toBe(1);
    expect(carriedTorchSource(player, "wood")).toBeNull();
    expect(sampleLight(withLightSources(world, base, []), 20, 12).torch).toBe(0);
  });

  it("does not leak diagonally through the corner between opaque blocks", () => {
    const world = new WorldModel("lighting-test");
    world.setBlock(8, 12, Block.Torch);
    world.setBlock(9, 12, Block.Stone);
    world.setBlock(8, 13, Block.Stone);
    const field = calculateLightField(world, { minX: 8, maxX: 10, minY: 12, maxY: 14 });
    expect(sampleLight(field, 9, 13).torch).toBe(0);
    expect(sampleLight(field, 9, 12).torch).toBe(1);
  });

  it.each([
    [0, 12], [0.01, 12.99], [-3.5, 12.5],
  ])("keeps circular distances in all directions from fractional source (%s, %s)", (x, y) => {
    const world = new WorldModel("lighting-test");
    for (let tileX = -25; tileX <= 25; tileX++) {
      for (let tileY = 0; tileY <= 30; tileY++) world.setBlock(tileX, tileY, Block.Air);
    }
    const base = calculateLightField(world, { minX: -10, maxX: 10, minY: 3, maxY: 22 });
    const field = withLightSources(world, base, [{ x, y, range: 10 }]);
    for (let tileX = -10; tileX <= 10; tileX++) {
      for (let tileY = 3; tileY <= 22; tileY++) {
        expect(sampleLight(field, tileX, tileY).torch).toBeCloseTo(
          sourceBrightness(Math.hypot(tileX + 0.5 - x, tileY + 0.5 - y), 10),
        );
      }
    }
  });

  it("retains placed lights and wall occlusion when adding a carried light", () => {
    const world = chamber(32);
    world.setBlock(30, 60, Block.Torch);
    const base = calculateLightField(world, { minX: 29, maxX: 35, minY: 59, maxY: 61 });
    const combined = withLightSources(world, base, [{ x: 29.25, y: 60.75, range: 10 }]);
    expect(sampleLight(combined, 30, 60).torch).toBe(1);
    expect(sampleLight(combined, 33, 60).torch).toBe(0);
    expect(() => withLightSources(world, base, [{ x: NaN, y: 60, range: 10 }])).toThrow(RangeError);
    expect(() => sourceBrightness(1, 0)).toThrow(RangeError);
  });

  it("keeps the halo circular above the top of the world", () => {
    const world = new WorldModel("lighting-test");
    world.setBlock(8, 1, Block.Torch);
    const field = calculateLightField(world, { minX: 8, maxX: 8, minY: -9, maxY: 2 });
    expect(sampleLight(field, 8, -8).torch).toBeCloseTo(0.4);
    expect(sampleLight(field, 8, -9).torch).toBe(0);
    expect(sampleLight(field, 8, -8).sky).toBe(1);
  });

  it("attenuates a carried light leaving foliage without dimming its origin", () => {
    const world = new WorldModel("lighting-test");
    world.setBlock(8, 12, Block.Leaves);
    const base = calculateLightField(world, { minX: 8, maxX: 9, minY: 12, maxY: 12 });
    const field = withLightSources(world, base, [{ x: 8.5, y: 12.5, range: 10 }]);
    expect(sampleLight(field, 8, 12).torch).toBe(1);
    expect(sampleLight(field, 9, 12).torch).toBeCloseTo(0.65);
  });
});
