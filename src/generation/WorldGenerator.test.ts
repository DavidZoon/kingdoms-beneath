import { describe, expect, it, vi } from "vitest";
import { WorldGenerator } from "./WorldGenerator";
import { Block, CHUNK_SIZE, MAX_TILE_X, WORLD_HEIGHT } from "../world/blocks";
import { BiomeResources, FOREST_RESOURCES, V4_RESOURCE_RULES, blobSize } from "./BiomeResources";

describe("versioned world generation", () => {
  it.each(["forest", "plain"] as const)("starts a vein at the configured probability in %s and grows connected host-only blobs across sectors", (biome) => {
    const ruleIndex = FOREST_RESOURCES.findIndex((rule) => rule.item === "copper_ore");
    const salt = 1000 + ruleIndex * 2;
    const terrain = {
      baseBlockAt: (_x: number, y: number) => y >= 40 ? Block.Stone : Block.Air,
      surfaceAt: () => 30,
      biomeAt: () => biome,
    };
    const create = (chance: number) => new BiomeResources(terrain, (x, y, s) =>
      x === 63 && y === 60 && s === salt ? chance : s === salt + 1 ? 0.5 : 1);
    const probability = biome === "forest" ? 0.02 * 0.7 : 0.014;
    const absent = create(probability);
    expect(absent.blockAt(63, 60)).toBe(Block.Stone);
    const first = create(probability - Number.EPSILON);
    const second = create(probability - Number.EPSILON);
    second.blockAt(64, 60);
    const vein: Array<[number, number]> = [];
    for (let x = 58; x <= 68; x++) {
      for (let y = 55; y <= 65; y++) {
        expect(first.blockAt(x, y)).toBe(second.blockAt(x, y));
        if (first.blockAt(x, y) === Block.CopperOre) vein.push([x, y]);
      }
    }
    expect(vein).toHaveLength(5);
    expect(vein.some(([x]) => x < 64)).toBe(true);
    expect(vein.some(([x]) => x >= 64)).toBe(true);
    for (const [x, y] of vein) {
      expect(terrain.baseBlockAt(x, y)).toBe(Block.Stone);
      expect(vein.some(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) === 1)).toBe(true);
    }
  });

  it.each(["forest", "plain"] as const)("embeds marble only in generated granite in %s", (biome) => {
    const graniteSalt = 1000 + FOREST_RESOURCES.findIndex((rule) => rule.item === "granite") * 2;
    const marbleSalt = 1000 + FOREST_RESOURCES.findIndex((rule) => rule.item === "marble") * 2;
    const random = (x: number, y: number, salt: number) =>
      x === -1 && y === 60 && [graniteSalt, marbleSalt].includes(salt) ? 0 :
        [graniteSalt + 1, marbleSalt + 1].includes(salt) ? 0.5 : 1;
    const terrain = { baseBlockAt: () => Block.Stone, surfaceAt: () => 30, biomeAt: () => biome };
    const forest = new BiomeResources(terrain, random);
    const granite = new BiomeResources(terrain, (x, y, salt) => salt === marbleSalt ? 1 : random(x, y, salt));
    let marbles = 0;
    for (let x = -10; x < 10; x++) {
      for (let y = 50; y < 70; y++) {
        if (forest.blockAt(x, y) === Block.Marble) {
          marbles++;
          expect(granite.blockAt(x, y)).toBe(Block.Granite);
        }
      }
    }
    expect(marbles).toBe(8);
    const sizes = Array.from({ length: 10001 }, (_, i) => blobSize(30, i / 10001));
    expect(sizes.reduce((a, b) => a + b, 0) / sizes.length).toBeCloseTo(30, 2);
  });

  it("reduces rare Forest resources by 65% while keeping v4 generation unchanged", () => {
    const salt = 1000 + FOREST_RESOURCES.findIndex((rule) => rule.item === "gold_ore") * 2;
    const terrain = { baseBlockAt: () => Block.Stone, surfaceAt: () => 30, biomeAt: () => "forest" as const };
    const random = (chance: number) => (x: number, y: number, s: number) =>
      x === 40 && y === 60 && s === salt ? chance : s === salt + 1 ? 0.5 : 1;
    expect(new BiomeResources(terrain, random(0.001 * 0.7)).blockAt(40, 60)).toBe(Block.Stone);
    expect(new BiomeResources(terrain, random(0.001 * 0.35 - Number.EPSILON)).blockAt(40, 60)).toBe(Block.GoldOre);
    expect(new BiomeResources(terrain, random(0.001 * 0.7), V4_RESOURCE_RULES).blockAt(40, 60)).toBe(Block.GoldOre);
  });

  it("grows more cotton on plain meadows but fewer trees than in forests", () => {
    const cottonSalt = 1000 + FOREST_RESOURCES.findIndex((rule) => rule.item === "cotton_plant") * 2;
    const oakSalt = 1000 + FOREST_RESOURCES.findIndex((rule) => rule.item === "oak_log") * 2;
    const terrain = (biome: "forest" | "plain") => ({
      baseBlockAt: (_x: number, y: number) => y === 30 ? biome === "plain" ? Block.Meadow : Block.Grass : y < 30 ? Block.Air : Block.Stone,
      surfaceAt: () => 30, biomeAt: () => biome,
    });
    const random = (salt: number) => (x: number, y: number, s: number) =>
      x === 40 && y === 30 && s === salt ? 0.02 : s === salt + 1 ? 0.5 : 1;
    const plain = new BiomeResources(terrain("plain"), random(cottonSalt));
    const forest = new BiomeResources(terrain("forest"), random(cottonSalt));
    expect(plain.harvestAt(40, 30)).toContain("cotton_plant");
    expect(forest.harvestAt(40, 30)).not.toContain("cotton_plant");
    expect(new BiomeResources(terrain("forest"), random(oakSalt)).blockAt(40, 29)).toBe(Block.OakLog);
    expect(new BiomeResources(terrain("plain"), random(oakSalt)).blockAt(40, 29)).toBe(Block.Air);
    expect(new BiomeResources(terrain("plain"), random(cottonSalt), V4_RESOURCE_RULES).harvestAt(40, 30)).toEqual([]);
  });

  it("adds repeatable water-filled basins in v4 without changing earlier worlds", () => {
    const current = new WorldGenerator("rivers", 4);
    const previous = new WorldGenerator("rivers", 3);
    const riverX = Array.from({ length: 200 }, (_, x) => x + 20).find((x) => current.waterLevelAt(x) !== null);
    if (riverX === undefined) throw new Error("No river found.");
    const level = current.waterLevelAt(riverX)!;
    expect(current.blockAt(riverX, level)).toBe(Block.Water);
    expect(current.blockAt(riverX, level + 2)).toBe(Block.Water);
    expect(current.blockAt(riverX, level + 3)).not.toBe(Block.Water);
    expect(new WorldGenerator("rivers", 4).blockAt(riverX, level)).toBe(Block.Water);
    expect(previous.waterLevelAt(riverX)).toBeNull();
    expect(previous.blockAt(riverX, level)).not.toBe(Block.Water);
  });

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
        if (previous === Block.PineLog) {
          trunks++;
          expect(foreground).toBe(Block.Air);
          expect(current.backgroundAt(x, y)).toBe(Block.PineLog);
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
      if (x === 0 && y === 43) return Block.PineLog;
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
      if (x === -1 && y === 40) return Block.PineLog;
      return Block.Air;
    });
    expect(generator.backgroundAt(0, 40)).toBe(Block.Stone);
  });
});
