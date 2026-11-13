import { Block, MAX_TILE_X, WORLD_HEIGHT, type BlockId } from "../world/blocks";
import { RESOURCES, type ResourceId } from "../world/resources";

type Support = ResourceId | "grass" | "dirt" | "stone" | "tree" | "water" | "river";
export interface ResourceRule {
  item: ResourceId;
  probability: number;
  foundwithin: Support | null;
  foundon: Support | null;
  blocksblobavg: number;
}

const ORIGINAL_FOREST_RESOURCES = [
  { item: "oak_log", probability: 0.120, foundwithin: null, foundon: "grass", blocksblobavg: 10 },
  { item: "pine_log", probability: 0.060, foundwithin: null, foundon: "grass", blocksblobavg: 8 },
  { item: "birch_log", probability: 0.040, foundwithin: null, foundon: "grass", blocksblobavg: 7 },
  { item: "jungle_log", probability: 0, foundwithin: null, foundon: null, blocksblobavg: 0 },
  { item: "deadwood_log", probability: 0.030, foundwithin: null, foundon: "dirt", blocksblobavg: 4 },
  { item: "oak_leaf", probability: 0.180, foundwithin: null, foundon: "oak_log", blocksblobavg: 30 },
  { item: "pine_needle", probability: 0.080, foundwithin: null, foundon: "pine_log", blocksblobavg: 25 },
  { item: "vine", probability: 0.015, foundwithin: null, foundon: "tree", blocksblobavg: 6 },
  { item: "tall_grass", probability: 0.100, foundwithin: null, foundon: "grass", blocksblobavg: 5 },
  { item: "reed", probability: 0.020, foundwithin: null, foundon: "water", blocksblobavg: 5 },
  { item: "cotton_plant", probability: 0.015, foundwithin: null, foundon: "grass", blocksblobavg: 3 },
  { item: "flax_plant", probability: 0.020, foundwithin: null, foundon: "grass", blocksblobavg: 3 },
  { item: "hemp_plant", probability: 0.015, foundwithin: null, foundon: "grass", blocksblobavg: 2 },
  { item: "wild_berry", probability: 0.050, foundwithin: null, foundon: "grass", blocksblobavg: 3 },
  { item: "mushroom_brown", probability: 0.040, foundwithin: null, foundon: "dirt", blocksblobavg: 2 },
  { item: "mushroom_red", probability: 0.025, foundwithin: null, foundon: "dirt", blocksblobavg: 2 },
  { item: "herb_mint", probability: 0.030, foundwithin: null, foundon: "grass", blocksblobavg: 2 },
  { item: "lavender", probability: 0.010, foundwithin: null, foundon: "grass", blocksblobavg: 2 },
  { item: "aloe", probability: 0, foundwithin: null, foundon: null, blocksblobavg: 0 },
  { item: "cactus_flesh", probability: 0, foundwithin: null, foundon: null, blocksblobavg: 0 },
  { item: "clay", probability: 0.030, foundwithin: "dirt", foundon: null, blocksblobavg: 8 },
  { item: "sand", probability: 0.040, foundwithin: null, foundon: "river", blocksblobavg: 20 },
  { item: "gravel", probability: 0.035, foundwithin: "dirt", foundon: null, blocksblobavg: 12 },
  { item: "peat", probability: 0.010, foundwithin: "dirt", foundon: null, blocksblobavg: 6 },
  { item: "salt_crystal", probability: 0.001, foundwithin: "stone", foundon: null, blocksblobavg: 3 },
  { item: "limestone", probability: 0.060, foundwithin: "stone", foundon: null, blocksblobavg: 24 },
  { item: "granite", probability: 0.100, foundwithin: "stone", foundon: null, blocksblobavg: 30 },
  { item: "basalt", probability: 0.020, foundwithin: "stone", foundon: null, blocksblobavg: 15 },
  { item: "marble", probability: 0.010, foundwithin: "granite", foundon: null, blocksblobavg: 8 },
  { item: "slate", probability: 0.040, foundwithin: "stone", foundon: null, blocksblobavg: 18 },
  { item: "coal", probability: 0.030, foundwithin: "stone", foundon: null, blocksblobavg: 6 },
  { item: "copper_ore", probability: 0.020, foundwithin: "stone", foundon: null, blocksblobavg: 5 },
  { item: "tin_ore", probability: 0.012, foundwithin: "stone", foundon: null, blocksblobavg: 4 },
  { item: "iron_ore", probability: 0.010, foundwithin: "stone", foundon: null, blocksblobavg: 4 },
  { item: "silver_ore", probability: 0.003, foundwithin: "stone", foundon: null, blocksblobavg: 3 },
  { item: "gold_ore", probability: 0.001, foundwithin: "stone", foundon: null, blocksblobavg: 2 },
  { item: "lead_ore", probability: 0.006, foundwithin: "stone", foundon: null, blocksblobavg: 3 },
  { item: "nickel_ore", probability: 0.003, foundwithin: "stone", foundon: null, blocksblobavg: 3 },
  { item: "quartz", probability: 0.015, foundwithin: "stone", foundon: null, blocksblobavg: 5 },
  { item: "sulfur", probability: 0.002, foundwithin: "stone", foundon: null, blocksblobavg: 3 },
  { item: "fish_raw", probability: 0.015, foundwithin: null, foundon: "water", blocksblobavg: 1 },
  { item: "shell", probability: 0.002, foundwithin: null, foundon: "river", blocksblobavg: 2 },
  { item: "pearl", probability: 0.0002, foundwithin: "shell", foundon: null, blocksblobavg: 1 },
  { item: "resin", probability: 0.025, foundwithin: null, foundon: "pine_log", blocksblobavg: 1 },
  { item: "sap", probability: 0.030, foundwithin: null, foundon: "oak_log", blocksblobavg: 1 },
] as const satisfies readonly ResourceRule[];

type GeneratedResourceId = (typeof ORIGINAL_FOREST_RESOURCES)[number]["item"];
type Biome = "forest" | "plain";
type BiomeRules = Readonly<Record<Biome, readonly ResourceRule[]>>;

const RARE_FOREST_ITEMS: readonly GeneratedResourceId[] = [
  "salt_crystal", "marble", "silver_ore", "gold_ore", "nickel_ore", "sulfur", "pearl",
];

export const FOREST_RESOURCES: readonly ResourceRule[] = ORIGINAL_FOREST_RESOURCES.map((rule) => ({
  ...rule, probability: rule.probability * (RARE_FOREST_ITEMS.includes(rule.item) ? 0.35 : 0.7),
}));

const PLAIN_PROBABILITIES: Record<GeneratedResourceId, number> = {
  oak_log: 0.014, pine_log: 0.004, birch_log: 0.010, jungle_log: 0, deadwood_log: 0.004,
  oak_leaf: 0.045, pine_needle: 0.016, vine: 0.002, tall_grass: 0.140, reed: 0.018,
  cotton_plant: 0.035, flax_plant: 0.040, hemp_plant: 0.025, wild_berry: 0.025,
  mushroom_brown: 0.006, mushroom_red: 0.003, herb_mint: 0.025, lavender: 0.040,
  aloe: 0, cactus_flesh: 0, clay: 0.018, sand: 0.030, gravel: 0.024, peat: 0.002,
  salt_crystal: 0.0005, limestone: 0.050, granite: 0.045, basalt: 0.008, marble: 0.002,
  slate: 0.020, coal: 0.020, copper_ore: 0.014, tin_ore: 0.008, iron_ore: 0.008,
  silver_ore: 0.001, gold_ore: 0.0003, lead_ore: 0.004, nickel_ore: 0.001,
  quartz: 0.010, sulfur: 0.0007, fish_raw: 0.014, shell: 0.002, pearl: 0.0001,
  resin: 0.0175, sap: 0.016,
};

export const PLAIN_RESOURCES: readonly ResourceRule[] = ORIGINAL_FOREST_RESOURCES.map((rule) => ({
  ...rule, probability: PLAIN_PROBABILITIES[rule.item],
}));

export const RESOURCE_RULES: BiomeRules = { forest: FOREST_RESOURCES, plain: PLAIN_RESOURCES };
export const V4_RESOURCE_RULES: BiomeRules = { forest: ORIGINAL_FOREST_RESOURCES, plain: [] };

export interface NaturalPickup { x: number; y: number; itemId: ResourceId; quantity: number }
interface Sector {
  blocks: Map<string, BlockId>;
  harvests: Map<string, ResourceId[]>;
  pickups: Map<string, NaturalPickup[]>;
}
const key = (x: number, y: number) => `${x},${y}`;
const SECTOR_SIZE = 64;
const HALO = 24;
const LOGS: readonly BlockId[] = [Block.OakLog, Block.PineLog, Block.BirchLog, Block.JungleLog, Block.DeadwoodLog];

export function isLog(block: BlockId): boolean { return LOGS.includes(block); }

export function blobSize(average: number, random: number): number {
  return Math.max(1, average + Math.floor(random * (2 * Math.floor(average / 4) + 1)) - Math.floor(average / 4));
}

interface Terrain {
  baseBlockAt(x: number, y: number): BlockId;
  surfaceAt(x: number): number;
  biomeAt(x: number): "forest" | "plain";
}

export class BiomeResources {
  private readonly sectors = new Map<number, Sector>();

  constructor(
    private readonly terrain: Terrain,
    private readonly random: (x: number, y: number, salt: number) => number,
    private readonly rules: BiomeRules = RESOURCE_RULES,
  ) {}

  blockAt(x: number, y: number): BlockId {
    return this.sector(x).blocks.get(key(x, y)) ?? this.terrain.baseBlockAt(x, y);
  }

  harvestAt(x: number, y: number): readonly ResourceId[] {
    return this.sector(x).harvests.get(key(x, y)) ?? [];
  }

  pickupsAt(x: number, y: number): readonly NaturalPickup[] {
    return this.sector(x).pickups.get(key(x, y)) ?? [];
  }

  private sector(x: number): Sector {
    const index = Math.floor(x / SECTOR_SIZE);
    const cached = this.sectors.get(index);
    if (cached) return cached;
    const sector = this.generate(index);
    if (this.sectors.size >= 16) this.sectors.delete(this.sectors.keys().next().value!);
    this.sectors.set(index, sector);
    return sector;
  }

  private generate(index: number): Sector {
    const left = Math.max(-MAX_TILE_X, index * SECTOR_SIZE - HALO);
    const right = Math.min(MAX_TILE_X + 1, (index + 1) * SECTOR_SIZE + HALO);
    const base = new Map<string, BlockId>();
    const sector: Sector = { blocks: new Map(), harvests: new Map(), pickups: new Map() };
    const hosts = new Map<Support, Set<string>>();
    const host = (name: Support): Set<string> => {
      let cells = hosts.get(name);
      if (!cells) { cells = new Set(); hosts.set(name, cells); }
      return cells;
    };
    for (let x = left; x < right; x++) {
      for (let y = 0; y < WORLD_HEIGHT - 1; y++) {
        const block = this.terrain.baseBlockAt(x, y);
        const cell = key(x, y);
        base.set(cell, block);
        if (block === Block.Grass || block === Block.Meadow) host("grass").add(cell);
        if (block === Block.Dirt) host("dirt").add(cell);
        if (block === Block.Stone) host("stone").add(cell);
        if (block === Block.Water) host("water").add(cell);
        if (y === this.terrain.surfaceAt(x) && base.get(key(x, y - 1)) === Block.Water) host("river").add(cell);
      }
    }
    const rules = (["forest", "plain"] as const).flatMap((biome) =>
      this.rules[biome].map((rule, ruleIndex) => ({ biome, rule, ruleIndex })));
    for (const { biome, rule, ruleIndex } of rules) {
      if (rule.probability === 0) continue;
      const support = rule.foundwithin ?? rule.foundon;
      if (!support) throw new Error(`Support manquant pour ${rule.item}.`);
      let eligible = hosts.get(support);
      if (!eligible) continue;
      if (rule.foundon && (support === "grass" || support === "dirt")) {
        eligible = new Set([...eligible].filter((cell) => {
          const [x, y] = cell.split(",").map(Number);
          return base.get(key(x, y - 1)) === Block.Air;
        }));
      }
      if (support in RESOURCES) {
        const definition = RESOURCES[support as ResourceId];
        if (definition.isBlock) {
          for (const cell of eligible) if (sector.blocks.get(cell) !== definition.block) eligible.delete(cell);
        }
      }
      const resource = RESOURCES[rule.item];
      const resultHosts = host(rule.item);
      for (const cell of eligible) {
        const [x, y] = cell.split(",").map(Number);
        if (this.terrain.biomeAt(x) !== biome ||
            this.random(x, y, 1000 + ruleIndex * 2) >= rule.probability) continue;
        const count = blobSize(rule.blocksblobavg, this.random(x, y, 1001 + ruleIndex * 2));
        const log = resource.isBlock && isLog(resource.block);
        if (log && (y !== this.terrain.surfaceAt(x) || (x >= 3 && x <= 13) ||
            base.get(key(x, y - 1)) !== Block.Air)) continue;
        const queue: Array<[number, number]> = [[x, y]];
        const visited = new Set<string>();
        let placed = 0;
        while (queue.length && placed < count) {
          const [cx, cy] = queue.shift()!;
          const target = key(cx, cy);
          if (visited.has(target)) continue;
          visited.add(target);
          if (cx < left || cx >= right || cy < 0 || cy >= WORLD_HEIGHT - 1 ||
              Math.abs(cx - x) + Math.abs(cy - y) > (log ? count : Math.ceil(Math.sqrt(count) * 2)) ||
              this.terrain.biomeAt(cx) !== biome) continue;
          if (resource.isBlock) {
            if (log) {
              const ty = cy - 1;
              if (base.get(key(cx, ty)) !== Block.Air) continue;
              sector.blocks.set(key(cx, ty), resource.block);
              resultHosts.add(key(cx, ty));
              host("tree").add(key(cx, ty));
            } else if (rule.foundwithin || support === "river") {
              if (!eligible.has(target)) continue;
              sector.blocks.set(target, resource.block);
              resultHosts.add(target);
            } else {
              if (base.get(target) !== Block.Air) {
                if (target === cell) { queue.push([cx, cy - 1], [cx - 1, cy], [cx + 1, cy]); }
                continue;
              }
              // Leaves never overwrite a trunk, but can surround it on either side.
              if (isLog(sector.blocks.get(target) ?? Block.Air)) {
                queue.push([cx, cy - 1], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1]);
                continue;
              }
              sector.blocks.set(target, resource.block);
              resultHosts.add(target);
            }
          } else {
            if (!eligible.has(target)) continue;
            if (rule.item === "fish_raw" || rule.item === "shell" || rule.item === "pearl") {
              const py = support === "river" ? cy - 1 : cy;
              resultHosts.add(key(cx, py));
              const pickup: NaturalPickup = { x: cx, y: py, itemId: rule.item, quantity: 1 };
              const pickups = sector.pickups.get(key(cx, py)) ?? [];
              if (!pickups.some((existing) => existing.itemId === rule.item)) pickups.push(pickup);
              sector.pickups.set(key(cx, py), pickups);
            } else {
              resultHosts.add(target);
              const harvests = sector.harvests.get(target) ?? [];
              if (!harvests.includes(rule.item)) harvests.push(rule.item);
              sector.harvests.set(target, harvests);
            }
          }
          placed++;
          if (log) queue.push([cx, cy - 1]);
          else queue.push([cx, cy - 1], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1]);
        }
      }
    }
    for (const [cell, items] of sector.harvests) {
      const block = sector.blocks.get(cell) ?? base.get(cell) ?? Block.Air;
      const supported = items.filter((item) => {
        const support = ORIGINAL_FOREST_RESOURCES.find((rule) => rule.item === item)?.foundon;
        if (support === "tree") return isLog(block);
        if (support === "grass") return block === Block.Grass || block === Block.Meadow;
        if (support === "dirt") return block === Block.Dirt;
        if (support === "water") return block === Block.Water;
        if (support && support in RESOURCES) {
          const resource = RESOURCES[support as ResourceId];
          return resource.isBlock && resource.block === block;
        }
        return false;
      });
      if (supported.length) sector.harvests.set(cell, supported);
      else sector.harvests.delete(cell);
    }
    const belongs = (cell: string) => {
      const x = Number(cell.split(",")[0]);
      return x >= index * SECTOR_SIZE && x < (index + 1) * SECTOR_SIZE;
    };
    for (const map of [sector.blocks, sector.harvests, sector.pickups]) {
      for (const cell of map.keys()) if (!belongs(cell)) map.delete(cell);
    }
    return sector;
  }
}
