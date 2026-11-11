import { ITEM_CAPACITY } from "../inventory/Inventory";
import type { BlockItemId, ItemId } from "../world/blocks";

export const RECIPE_IDS = ["torch", "ladder", "woodStairs", "stoneStairs", "stonePickaxe"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];
export const MAX_CRAFT_QUANTITY = ITEM_CAPACITY;

export interface Recipe {
  id: RecipeId;
  output: ItemId;
  outputPerRecipe: number;
  materials: Readonly<Partial<Record<BlockItemId, number>>>;
  ticksPerItem: number;
}

export interface CraftJob {
  recipeId: RecipeId;
  quantity: number;
  completed: number;
  progressTicks: number;
}

export const RECIPES: Record<RecipeId, Recipe> = {
  torch: { id: "torch", output: "torch", outputPerRecipe: 2, materials: { wood: 1 }, ticksPerItem: 60 },
  ladder: { id: "ladder", output: "ladder", outputPerRecipe: 1, materials: { wood: 1 }, ticksPerItem: 90 },
  woodStairs: {
    id: "woodStairs", output: "woodStairs", outputPerRecipe: 2, materials: { wood: 1 }, ticksPerItem: 120,
  },
  stoneStairs: {
    id: "stoneStairs", output: "stoneStairs", outputPerRecipe: 2, materials: { stone: 1 }, ticksPerItem: 180,
  },
  stonePickaxe: {
    id: "stonePickaxe", output: "stonePickaxe", outputPerRecipe: 1,
    materials: { wood: 1, stone: 1 }, ticksPerItem: 180,
  },
};

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && RECIPE_IDS.some((id) => id === value);
}

export function validCraftQuantity(recipe: Recipe, quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= MAX_CRAFT_QUANTITY &&
    quantity % recipe.outputPerRecipe === 0;
}

export function requiredMaterials(recipe: Recipe, quantity: number): Array<[BlockItemId, number]> {
  if (!validCraftQuantity(recipe, quantity)) throw new RangeError("Quantité de fabrication invalide.");
  const batches = quantity / recipe.outputPerRecipe;
  return Object.entries(recipe.materials).map(([itemId, amount]) => [itemId as BlockItemId, amount * batches]);
}
