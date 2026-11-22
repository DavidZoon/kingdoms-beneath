import type { ItemStack } from "./Inventory";
import { Block, type BlockId } from "../world/blocks";

export const CHEST_ITEMS = ["smallChest", "mediumChest", "largeChest"] as const;
export type ChestItemId = (typeof CHEST_ITEMS)[number];
export const CHEST_CAPACITY: Record<ChestItemId, 16 | 32 | 64> = {
  smallChest: 16,
  mediumChest: 32,
  largeChest: 64,
};
export const CHEST_BLOCKS: Record<ChestItemId, BlockId> = {
  smallChest: Block.SmallChest,
  mediumChest: Block.MediumChest,
  largeChest: Block.LargeChest,
};

export interface ChestState {
  x: number;
  y: number;
  itemId: ChestItemId;
  slots: Array<ItemStack | null>;
}

export function chestItemForBlock(block: BlockId): ChestItemId | null {
  return CHEST_ITEMS.find((item) => CHEST_BLOCKS[item] === block) ?? null;
}
