import { MATERIAL_ITEMS, isToolItem, TOOLS, type Inventory, type ItemId, type MaterialItemId, type Rotation, type ToolStack } from "../world/blocks";

export const STACK_SIZE = 99;
export const INVENTORY_SLOT_COUNT = 24;
export const HOTBAR_SLOT_COUNT = 10;
export const ITEM_CAPACITY = STACK_SIZE * INVENTORY_SLOT_COUNT;

export interface MaterialStack {
  itemId: MaterialItemId;
  quantity: number;
  rotation?: Rotation;
  durability?: never;
}
export type ItemStack = MaterialStack | ToolStack;
export type SlotLocation = { area: "inventory" | "hotbar"; index: number };

export function isToolStack(stack: ItemStack): stack is ToolStack {
  return isToolItem(stack.itemId);
}

export function emptyInventory(): Inventory {
  return { ...Object.fromEntries(MATERIAL_ITEMS.map((item) => [item, 0])) as Record<MaterialItemId, number>, tools: [] };
}

export function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory, tools: inventory.tools.map((tool) => ({ ...tool })) };
}

export function getStacks(inventory: Inventory): ItemStack[] {
  const materials = MATERIAL_ITEMS.flatMap((itemId) => {
    const stacks: ItemStack[] = [];
    for (let remaining = inventory[itemId]; remaining > 0; remaining -= STACK_SIZE) {
      stacks.push({ itemId, quantity: Math.min(remaining, STACK_SIZE) });
    }
    return stacks;
  });
  return [...materials, ...inventory.tools];
}

export function removeInventoryStack(inventory: Inventory, index: number, quantity: number): void {
  const stack = getStacks(inventory)[index];
  if (!stack || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > stack.quantity) {
    throw new RangeError("Pile ou quantité à retirer invalide.");
  }
  if (isToolStack(stack)) inventory.tools.splice(inventory.tools.indexOf(stack), 1);
  else inventory[stack.itemId] -= quantity;
}

export function availableItemSpace(
  inventory: Inventory, itemId: ItemId, hotbar: readonly (ItemStack | null)[] = [],
): number {
  const stacks = getStacks(inventory);
  const freeSlots = Math.max(0, INVENTORY_SLOT_COUNT - stacks.length);
  if (isToolItem(itemId)) return freeSlots;
  const partialStack = inventory[itemId] > 0 && inventory[itemId] % STACK_SIZE > 0
    ? STACK_SIZE - inventory[itemId] % STACK_SIZE
    : 0;
  const shortcutSpace = hotbar.reduce(
    (total, stack) => total + (stack?.itemId === itemId ? STACK_SIZE - stack.quantity : 0), 0,
  );
  return Math.max(0, partialStack + freeSlots * STACK_SIZE) + shortcutSpace;
}

export function addItems(
  inventory: Inventory, itemId: ItemId, quantity: number, hotbar: readonly (ItemStack | null)[] = [],
  durability?: number,
): number {
  const amount = Math.max(0, Math.min(quantity, availableItemSpace(inventory, itemId, hotbar)));
  if (isToolItem(itemId)) {
    const remainingDurability = durability ?? TOOLS[itemId].maxDurability;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(remainingDurability) ||
        remainingDurability < 1 || remainingDurability > TOOLS[itemId].maxDurability) {
      throw new RangeError("Quantité ou durabilité d'outil invalide.");
    }
    for (let index = 0; index < amount; index++) {
      inventory.tools.push({ itemId, quantity: 1, durability: remainingDurability });
    }
    return amount;
  }
  let remaining = amount;
  for (const stack of hotbar) {
    if (remaining === 0) break;
    if (!stack || stack.itemId !== itemId) continue;
    const added = Math.min(remaining, STACK_SIZE - stack.quantity);
    stack.quantity += added;
    remaining -= added;
  }
  inventory[itemId] += remaining;
  return amount;
}
