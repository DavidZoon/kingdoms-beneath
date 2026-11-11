import { describe, expect, it } from "vitest";
import { WorldGenerator } from "../generation/WorldGenerator";
import { Block, CHUNK_SIZE } from "./blocks";
import { WorldModel, cellKey, chunkOf } from "./WorldModel";

describe("deterministic terrain", () => {
  it("generates the same cells regardless of chunk load order, including negative X", () => {
    const first = new WorldModel("kingdom");
    const second = new WorldModel("kingdom");
    const negative = first.getChunk(-1, 1).slice();
    first.getChunk(2, 0);
    second.getChunk(2, 0);
    expect(second.getChunk(-1, 1)).toEqual(negative);
    expect(chunkOf(-1)).toBe(-1);
    expect(chunkOf(-CHUNK_SIZE)).toBe(-1);
    expect(chunkOf(-CHUNK_SIZE - 1)).toBe(-2);
  });

  it("changes terrain with the seed", () => {
    const a = new WorldGenerator("a");
    const b = new WorldGenerator("b");
    const heights = (generator: WorldGenerator) => Array.from({ length: 100 }, (_, x) => generator.surfaceAt(x));
    expect(heights(a)).not.toEqual(heights(b));
  });

  it("updates cached cells and removes redundant overlays", () => {
    const world = new WorldModel("test");
    const y = world.generator.surfaceAt(-1);
    const chunk = world.getChunk(-1, chunkOf(y));
    world.setBlock(-1, y, Block.Air);
    expect(world.getBlock(-1, y)).toBe(Block.Air);
    expect(chunk[(y % CHUNK_SIZE) * CHUNK_SIZE + CHUNK_SIZE - 1]).toBe(Block.Air);
    expect(world.editCount).toBe(1);
    world.setBlock(-1, y, world.generator.blockAt(-1, y));
    expect(world.editCount).toBe(0);
  });

  it("increments its revision only when a cell actually changes", () => {
    const world = new WorldModel("test");
    const y = world.generator.surfaceAt(8);
    const initial = world.getBlock(8, y);
    expect(world.revision).toBe(0);
    world.setBlock(8, y, initial);
    expect(world.revision).toBe(0);
    world.setBlock(8, y, Block.Air);
    expect(world.revision).toBe(1);
    world.setBlock(8, y, Block.Air);
    expect(world.revision).toBe(1);
    world.setBlock(8, y, initial);
    expect(world.revision).toBe(2);
  });

  it("evicts generated chunks without losing edits", () => {
    const world = new WorldModel("test");
    const y = world.generator.surfaceAt(-1);
    world.setBlock(-1, y, Block.Air);
    world.getChunk(-1, 0);
    world.getChunk(0, 0);
    world.retainChunks(new Set([cellKey(0, 0)]));
    expect(world.cachedChunkCount).toBe(1);
    world.getChunk(-1, chunkOf(y));
    expect(world.getBlock(-1, y)).toBe(Block.Air);
    expect(new WorldModel("test", world.edits).getBlock(-1, y)).toBe(Block.Air);
  });

  it("generates the same background regardless of chunk order and foreground edits", () => {
    const first = new WorldModel("two-layers", [], 3);
    const second = new WorldModel("two-layers", [], 3);
    const original = first.getBackgroundChunk(-1, 1).slice();
    first.getBackgroundChunk(1, 1);
    second.getBackgroundChunk(1, 1);
    expect(second.getBackgroundChunk(-1, 1)).toEqual(original);
    const y = first.generator.surfaceAt(-1) + 1;
    const background = first.getBackground(-1, y);
    expect(background).not.toBe(Block.Air);
    first.setBlock(-1, y, Block.Air);
    expect(first.getBackground(-1, y)).toBe(background);
    expect(first.getBackgroundOrigin(-1, y)).toBe("natural");
    expect(() => first.setBackground(-1, y, Block.Air)).toThrow(/fond naturel/);
  });

  it("persists a removed natural trunk even after rebuilding and mining the same material", () => {
    const world = new WorldModel("two-layers", [], 3);
    let trunk: { x: number; y: number } | null = null;
    for (let x = -100; x <= 100 && !trunk; x++) {
      const y = world.generator.surfaceAt(x) - 1;
      if (world.getBackgroundOrigin(x, y) === "trunk") trunk = { x, y };
    }
    if (!trunk) throw new Error("No generated trunk found.");
    const { x, y } = trunk;
    world.getBackgroundChunk(chunkOf(x), chunkOf(y));
    world.setBackground(x, y, Block.Air);
    expect(world.getBackgroundOrigin(x, y)).toBe("empty");
    expect(world.backgroundEdits).toEqual([{ x, y, block: Block.Air }]);
    world.setBackground(x, y, Block.Wood, 90);
    expect(world.getBackgroundOrigin(x, y)).toBe("placed");
    expect(world.getBackgroundRotation(x, y)).toBe(90);
    world.setBackground(x, y, Block.Air);
    world.retainChunks(new Set());
    const restored = new WorldModel("two-layers", world.edits, 3, world.backgroundEdits);
    expect(restored.getBackground(x, y)).toBe(Block.Air);
    expect(restored.getBackgroundOrigin(x, y)).toBe("empty");
    expect(restored.backgroundEdits).toEqual([{ x, y, block: Block.Air }]);
  });
});
