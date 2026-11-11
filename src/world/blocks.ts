export const TILE_SIZE = 16;
export const TILE_ART_SIZE = 32;
export const CHUNK_SIZE = 32;
export const WORLD_HEIGHT = 96;
export const MAX_TILE_X = 1_000_000;

export const Block = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Wood: 4,
  Leaves: 5,
  Bedrock: 6,
  Ladder: 7,
  Branch: 8,
  Meadow: 9,
  Torch: 10,
  WoodStairs: 11,
  StoneStairs: 12,
} as const;

export type BlockId = (typeof Block)[keyof typeof Block];
export const BLOCK_ITEMS = ["dirt", "stone", "wood", "ladder", "torch", "woodStairs", "stoneStairs"] as const;
export const TOOL_ITEMS = ["stonePickaxe"] as const;
export const ITEMS = [...BLOCK_ITEMS, ...TOOL_ITEMS] as const;
export type BlockItemId = (typeof BLOCK_ITEMS)[number];
export type ToolItemId = (typeof TOOL_ITEMS)[number];
export type ItemId = (typeof ITEMS)[number];
export interface ToolStack {
  itemId: ToolItemId;
  quantity: 1;
  durability: number;
  rotation?: never;
}
export type Inventory = Record<BlockItemId, number> & { tools: ToolStack[] };
export const TOOLS: Record<ToolItemId, { category: "tools"; maxDurability: number; miningPower: number }> = {
  stonePickaxe: { category: "tools", maxDurability: 500, miningPower: 2 },
};

export function isToolItem(itemId: ItemId): itemId is ToolItemId {
  return TOOL_ITEMS.some((tool) => tool === itemId);
}
export type Rotation = 0 | 90 | 180 | 270;
export type ConstructionPlane = "foreground" | "background";

export function isConstructionPlane(value: unknown): value is ConstructionPlane {
  return value === "foreground" || value === "background";
}

export function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

export function rotateQuarterTurn(rotation: Rotation, direction: -1 | 1): Rotation {
  const next = (rotation + direction * 90 + 360) % 360;
  if (!isRotation(next)) throw new Error("Rotation de pièce invalide.");
  return next;
}

export const ITEM_LABELS: Record<ItemId, string> = {
  dirt: "Terre",
  stone: "Pierre",
  wood: "Bois",
  ladder: "Échelle",
  torch: "Torche",
  woodStairs: "Escalier en bois",
  stoneStairs: "Escalier en pierre",
  stonePickaxe: "Pioche en pierre",
};

export const ITEM_BLOCKS: Record<BlockItemId, BlockId> = {
  dirt: Block.Dirt,
  stone: Block.Stone,
  wood: Block.Wood,
  ladder: Block.Ladder,
  torch: Block.Torch,
  woodStairs: Block.WoodStairs,
  stoneStairs: Block.StoneStairs,
};

export const ITEM_PLANES: Record<ItemId, readonly ConstructionPlane[]> = {
  dirt: ["foreground", "background"],
  stone: ["foreground", "background"],
  wood: ["foreground", "background"],
  ladder: ["foreground"],
  torch: ["foreground"],
  woodStairs: ["foreground", "background"],
  stoneStairs: ["foreground", "background"],
  stonePickaxe: [],
};

export function canPlaceItemOnPlane(itemId: ItemId, plane: ConstructionPlane): boolean {
  return !isToolItem(itemId) && ITEM_PLANES[itemId].includes(plane);
}

export function canUseItemOnPlane(itemId: ItemId, plane: ConstructionPlane): boolean {
  return isToolItem(itemId) || canPlaceItemOnPlane(itemId, plane);
}

export function itemForBlock(block: BlockId): BlockItemId | null {
  return BLOCK_ITEMS.find((itemId) => ITEM_BLOCKS[itemId] === block) ?? null;
}

export const BLOCKS: Record<
  BlockId,
  { color: string; solid: boolean; drop: BlockItemId | null; durability: number | null; opacity: number }
> = {
  [Block.Air]: { color: "transparent", solid: false, drop: null, durability: 0, opacity: 0 },
  [Block.Grass]: { color: "#688b43", solid: true, drop: "dirt", durability: 4, opacity: 1 },
  [Block.Dirt]: { color: "#8a6045", solid: true, drop: "dirt", durability: 4, opacity: 1 },
  [Block.Stone]: { color: "#687676", solid: true, drop: "stone", durability: 12, opacity: 1 },
  [Block.Wood]: { color: "#9b6b3f", solid: true, drop: "wood", durability: 6, opacity: 1 },
  [Block.Leaves]: { color: "#3d7553", solid: false, drop: null, durability: 1, opacity: 0.35 },
  [Block.Bedrock]: { color: "#343f46", solid: true, drop: null, durability: null, opacity: 1 },
  [Block.Ladder]: { color: "#b78a4c", solid: false, drop: "ladder", durability: 3, opacity: 0 },
  [Block.Branch]: { color: "#66804a", solid: true, drop: "wood", durability: 3, opacity: 1 },
  [Block.Meadow]: { color: "#8eaa59", solid: true, drop: "dirt", durability: 4, opacity: 1 },
  [Block.Torch]: { color: "#edac50", solid: false, drop: "torch", durability: 2, opacity: 0 },
  [Block.WoodStairs]: { color: "#9b6b3f", solid: true, drop: "woodStairs", durability: 6, opacity: 1 },
  [Block.StoneStairs]: { color: "#687676", solid: true, drop: "stoneStairs", durability: 12, opacity: 1 },
};

export function isStairBlock(block: BlockId): boolean {
  return block === Block.WoodStairs || block === Block.StoneStairs;
}

export function isBlockId(value: unknown): value is BlockId {
  return typeof value === "number" && Number.isInteger(value) &&
    Object.values(Block).some((block) => block === value);
}

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && ITEMS.some((item) => item === value);
}
