import { describe, expect, it, vi } from "vitest";
import { WorldGenerator } from "./WorldGenerator";
import { Block, CHUNK_SIZE, MAX_TILE_X, WORLD_HEIGHT } from "../world/blocks";

describe("versioned world generation", () => {
  it("keeps v1 terrain unchanged and makes plains visually distinct in v2", () => {
    const legacy = new WorldGenerator("generation-test", 1);
    const current = new WorldGenerator("generation-test", 2);
    const plainX = Array.from({ length: 300 }, (_, x) => x - 150)
      .find((x) => current.biomeAt(x) === "plain");
    expect(plainX).toBeDefined();
    if (plainX === undefined) throw new Error("No plain biome found for the test seed.");
    expect(legacy.blockAt(plainX, legacy.surfaceAt(plainX))).toBe(Block.Grass);
    expect(current.blockAt(plainX, current.surfaceAt(plainX))).toBe(Block.Meadow);
  });

  it("generates repeatable caves only for the v2 generator", () => {
    const first = new WorldGenerator("cave-test", 2);
    const second = new WorldGenerator("cave-test", 2);
    const legacy = new WorldGenerator("cave-test", 1);
    let caveCell: { x: number; y: number } | undefined;
    for (let x = -100; x <= 100 && !caveCell; x++) {
      for (let y = first.surfaceAt(x) + 8; y < 92; y++) {
        if (first.blockAt(x, y) === Block.Air) {
          caveCell = { x, y };
          break;
        }
      }
    }
    expect(caveCell).toBeDefined();
    if (!caveCell) throw new Error("No cave cell found for the test seed.");
    expect(second.blockAt(caveCell.x, caveCell.y)).toBe(Block.Air);
    expect(legacy.blockAt(caveCell.x, caveCell.y)).not.toBe(Block.Air);
  });

  it("preserves v2 terrain in v3 except for moving natural trunks to the background", () => {
    const old = new WorldGenerator("two-layers", 2);
    const current = new WorldGenerator("two-layers", 3);
    let trunks = 0;
    for (let x = -100; x <= 100; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const previous = old.blockAt(x, y);
        const foreground = current.blockAt(x, y);
        if (previous === Block.Wood) {
          trunks++;
          expect(foreground).toBe(Block.Air);
          expect(current.backgroundAt(x, y)).toBe(Block.Wood);
          expect(current.isBackgroundTrunk(x, y)).toBe(true);
        } else {
          expect(foreground).toBe(previous);
        }
        if (y > current.surfaceAt(x) && foreground !== Block.Air) {
          expect(current.backgroundAt(x, y)).toBe(foreground);
        }
      }
    }
    expect(trunks).toBeGreaterThan(0);
    expect(old.backgroundAt(0, 50)).toBe(Block.Air);
    expect(new WorldGenerator("two-layers", 1).backgroundAt(0, 50)).toBe(Block.Air);
  });

  it("chooses the nearest generated foreground block by Euclidean distance", () => {
    const generator = new WorldGenerator("distance", 3);
    vi.spyOn(generator, "surfaceAt").mockReturnValue(28);
    vi.spyOn(generator, "blockAt").mockImplementation((x, y) => {
      if (x === 0 && y === 35) return Block.Dirt;
      if (x === 2 && y === 42) return Block.Stone;
      if (x === 0 && y === 43) return Block.Wood;
      return Block.Air;
    });
    expect(generator.backgroundAt(0, 40)).toBe(Block.Stone);
  });

  it("uses the nearest original block for real caves across positive and negative chunks", () => {
    const generator = new WorldGenerator("cave-test", 3);
    const caves: Array<{ x: number; y: number }> = [];
    for (const chunk of [-3, -1, 0, 1, 3]) {
      let found: { x: number; y: number } | undefined;
      for (let x = chunk * CHUNK_SIZE; x < (chunk + 1) * CHUNK_SIZE && !found; x++) {
        for (let y = generator.surfaceAt(x) + 8; y < WORLD_HEIGHT - 4; y++) {
          if (generator.blockAt(x, y) === Block.Air) {
            found = { x, y };
            break;
          }
        }
      }
      if (found) caves.push(found);
    }
    expect(caves.length).toBeGreaterThanOrEqual(3);
    expect(caves.some(({ x }) => x < 0)).toBe(true);
    expect(caves.some(({ x }) => x >= 0)).toBe(true);

    for (const cave of caves) {
      let nearest: { distance: number; block: number } | undefined;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = Math.max(-MAX_TILE_X, cave.x - WORLD_HEIGHT);
          x <= Math.min(MAX_TILE_X, cave.x + WORLD_HEIGHT); x++) {
          const distance = (x - cave.x) ** 2 + (y - cave.y) ** 2;
          if (nearest && distance >= nearest.distance) continue;
          const block = generator.blockAt(x, y);
          if (block !== Block.Air) nearest = { distance, block };
        }
      }
      if (!nearest) throw new Error("No generated foreground block found near the cave.");
      expect(generator.backgroundAt(cave.x, cave.y)).toBe(nearest.block);
      expect(generator.isImmutableBackground(cave.x, cave.y)).toBe(true);
    }
  });

  it("breaks equal-distance ties consistently by y then x", () => {
    const generator = new WorldGenerator("distance", 3);
    vi.spyOn(generator, "surfaceAt").mockReturnValue(28);
    vi.spyOn(generator, "blockAt").mockImplementation((x, y) => {
      if (x === 0 && y === 35) return Block.Dirt;
      if (x === 0 && y === 39) return Block.Stone;
      if (x === -1 && y === 40) return Block.Wood;
      return Block.Air;
    });
    expect(generator.backgroundAt(0, 40)).toBe(Block.Stone);
  });
});
