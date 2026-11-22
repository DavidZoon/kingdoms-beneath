import { ITEM_CAPACITY } from "../inventory/Inventory";
import type { MaterialItemId, ItemId, StationId } from "../world/blocks";

export const RECIPE_IDS = [
  "torch", "ladder", "woodStairs", "stoneStairs", "stonePickaxe",
  "workbench", "furnace", "copperIngot", "copperPickaxe", "forge", "ironIngot", "ironPickaxe",
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];
export const MAX_CRAFT_QUANTITY = ITEM_CAPACITY;
export const MAX_CRAFT_SELECTION = 99;

export interface Recipe {
  id: RecipeId;
  output: ItemId;
  outputPerRecipe: number;
  materials: Readonly<Partial<Record<MaterialItemId, number>>>;
  ticksPerItem: number;
  station: StationId | null;
}

export interface CraftJob {
  recipeId: RecipeId;
  quantity: number;
  completed: number;
  progressTicks: number;
}

export const RECIPES: Record<RecipeId, Recipe> = {
  torch: { id: "torch", output: "torch", outputPerRecipe: 2, materials: { pine_log: 1 }, ticksPerItem: 60, station: null },
  ladder: { id: "ladder", output: "ladder", outputPerRecipe: 1, materials: { pine_log: 1 }, ticksPerItem: 90, station: null },
  woodStairs: {
    id: "woodStairs", output: "woodStairs", outputPerRecipe: 2, materials: { pine_log: 1 }, ticksPerItem: 120, station: null,
  },
  stoneStairs: {
    id: "stoneStairs", output: "stoneStairs", outputPerRecipe: 2, materials: { stone: 1 }, ticksPerItem: 180, station: null,
  },
  stonePickaxe: {
    id: "stonePickaxe", output: "stonePickaxe", outputPerRecipe: 1,
    materials: { pine_log: 1, stone: 1 }, ticksPerItem: 180, station: null,
  },
  workbench: {
    id: "workbench", output: "workbench", outputPerRecipe: 1,
    materials: { pine_log: 4 }, ticksPerItem: 180, station: null,
  },
  furnace: {
    id: "furnace", output: "furnace", outputPerRecipe: 1,
    materials: { stone: 8, clay: 4 }, ticksPerItem: 360, station: "workbench",
  },
  copperIngot: {
    id: "copperIngot", output: "copper_ingot", outputPerRecipe: 1,
    materials: { copper_ore: 2, coal: 1 }, ticksPerItem: 240, station: "furnace",
  },
  copperPickaxe: {
    id: "copperPickaxe", output: "copperPickaxe", outputPerRecipe: 1,
    materials: { pine_log: 1, copper_ingot: 2 }, ticksPerItem: 300, station: "workbench",
  },
  forge: {
    id: "forge", output: "forge", outputPerRecipe: 1,
    materials: { stone: 12, iron_ingot: 4, coal: 2 }, ticksPerItem: 420, station: "furnace",
  },
  ironIngot: {
    id: "ironIngot", output: "iron_ingot", outputPerRecipe: 1,
    materials: { iron_ore: 2, coal: 2 }, ticksPerItem: 300, station: "furnace",
  },
  ironPickaxe: {
    id: "ironPickaxe", output: "ironPickaxe", outputPerRecipe: 1,
    materials: { pine_log: 1, iron_ingot: 3 }, ticksPerItem: 360, station: "forge",
  },
};

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && RECIPE_IDS.some((id) => id === value);
}

export function validCraftQuantity(recipe: Recipe, quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= MAX_CRAFT_QUANTITY &&
    quantity % recipe.outputPerRecipe === 0;
}

export function requiredMaterials(recipe: Recipe, quantity: number): Array<[MaterialItemId, number]> {
  if (!validCraftQuantity(recipe, quantity)) throw new RangeError("Quantité de fabrication invalide.");
  const batches = quantity / recipe.outputPerRecipe;
  return Object.entries(recipe.materials).map(([itemId, amount]) => [itemId as MaterialItemId, amount * batches]);
}

export function clampCraftQuantity(
  recipe: Recipe, quantity: number, available: (itemId: MaterialItemId) => number,
): number {
  if (!Number.isSafeInteger(quantity)) throw new RangeError("Quantité de fabrication invalide.");
  const maximumBatches = Math.min(
    Math.floor(MAX_CRAFT_SELECTION / recipe.outputPerRecipe),
    ...requiredMaterials(recipe, recipe.outputPerRecipe).map(([itemId, amount]) =>
      Math.floor(available(itemId) / amount)),
  );
  if (maximumBatches <= 0) return 0;
  return Math.min(maximumBatches, Math.max(1, Math.floor(quantity / recipe.outputPerRecipe))) * recipe.outputPerRecipe;
}
