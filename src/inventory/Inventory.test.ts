import { describe, expect, it } from "vitest";
import {
  addItems, availableItemSpace, emptyInventory, getStacks, INVENTORY_SLOT_COUNT, STACK_SIZE, type ItemStack,
} from "./Inventory";
import type { Inventory } from "../world/blocks";

describe("stacked inventory", () => {
  it("splits resource totals into stacks of at most 99", () => {
    const inventory: Inventory = { ...emptyInventory(), dirt: 100 };
    expect(getStacks(inventory)).toEqual([
      { itemId: "dirt", quantity: 99 },
      { itemId: "dirt", quantity: 1 },
    ]);
  });

  it("enforces the shared 24-slot capacity while filling an existing partial stack", () => {
    const inventory: Inventory = { ...emptyInventory(), dirt: STACK_SIZE * 23, stone: 98 };
    expect(addItems(inventory, "stone", 5)).toBe(1);
    expect(inventory.stone).toBe(99);
    expect(getStacks(inventory)).toHaveLength(INVENTORY_SLOT_COUNT);
    expect(addItems(inventory, "wood", 1)).toBe(0);
  });

  it("fills matching shortcuts before inventory without changing rotations or empty slots", () => {
    const inventory = { ...emptyInventory(), wood: 12 };
    const hotbar: Array<ItemStack | null> = [
      null, { itemId: "wood", quantity: 97, rotation: 90 },
      { itemId: "dirt", quantity: 2 }, { itemId: "wood", quantity: 98 },
    ];
    expect(addItems(inventory, "wood", 6, hotbar)).toBe(6);
    expect(hotbar).toEqual([
      null, { itemId: "wood", quantity: 99, rotation: 90 },
      { itemId: "dirt", quantity: 2 }, { itemId: "wood", quantity: 99 },
    ]);
    expect(inventory.wood).toBe(15);
  });

  it("uses only the remaining shortcut capacity when inventory is full", () => {
    const inventory = { ...emptyInventory(), dirt: STACK_SIZE * INVENTORY_SLOT_COUNT };
    const hotbar: Array<ItemStack | null> = [null, { itemId: "wood", quantity: 97 }];
    expect(availableItemSpace(inventory, "wood", hotbar)).toBe(2);
    expect(addItems(inventory, "wood", 5, hotbar)).toBe(2);
    expect(hotbar[1]?.quantity).toBe(99);
    expect(inventory.wood).toBe(0);
    expect(availableItemSpace(inventory, "wood", hotbar)).toBe(0);
    expect(addItems(inventory, "stone", 1, hotbar)).toBe(0);
    expect(hotbar[0]).toBeNull();
  });

  it("uses inventory when no shortcut stack can accept the item", () => {
    const inventory = emptyInventory();
    const hotbar: Array<ItemStack | null> = [null, { itemId: "wood", quantity: 99 }];
    expect(addItems(inventory, "wood", 2, hotbar)).toBe(2);
    expect(addItems(inventory, "stone", 3, hotbar)).toBe(3);
    expect(inventory).toMatchObject({ wood: 2, stone: 3 });
    expect(hotbar).toEqual([null, { itemId: "wood", quantity: 99 }]);
  });
});
