import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { parseSave, serializeSave } from "../save/schema";
import { Block, BLOCKS, TILE_SIZE, type BlockId, type MaterialItemId } from "../world/blocks";
import { clampCraftQuantity, MAX_CRAFT_QUANTITY, RECIPES, requiredMaterials, type RecipeId } from "./Recipes";

const idle = { left: false, right: false, jump: false, run: false, up: false, down: false };

function advance(session: GameSession, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) session.step(idle);
}

describe("progressive crafting", () => {
  it.each([
    ["torch", "pine_log", 2],
    ["ladder", "pine_log", 1],
    ["woodStairs", "pine_log", 2],
    ["stoneStairs", "stone", 2],
  ] as const)("reserves one %s recipe and produces each %s-based output separately", (id, material, quantity) => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.inventory[material] = 1;
    const recipe = RECIPES[id];
    expect(requiredMaterials(recipe, quantity)).toEqual([[material, 1]]);
    expect(session.startCraft(id, quantity)).toEqual({ ok: true });
    expect(session.inventory[material]).toBe(0);
    expect(session.totalItems(recipe.output)).toBe(0);

    advance(session, recipe.ticksPerItem - 1);
    expect(session.totalItems(recipe.output)).toBe(0);
    expect(session.crafting?.progressTicks).toBe(recipe.ticksPerItem - 1);
    advance(session, 1);
    expect(session.totalItems(recipe.output)).toBe(1);
    if (quantity > 1) {
      expect(session.crafting).toMatchObject({ completed: 1, progressTicks: 0 });
      advance(session, recipe.ticksPerItem);
    }
    expect(session.totalItems(recipe.output)).toBe(quantity);
    expect(session.crafting).toBeNull();
  });

  it("reserves materials across inventory and shortcuts and clears exhausted slots", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 1;
    session.hotbar[7] = { itemId: "pine_log", quantity: 1 };
    session.selectHotbar(7);
    expect(session.startCraft("torch", 4)).toEqual({ ok: true });
    expect(session.inventory.pine_log).toBe(0);
    expect(session.hotbar[7]).toBeNull();
    expect(session.selectedItem).toBeNull();
    expect(session.startCraft("ladder", 1).ok).toBe(false);
    advance(session, 240);
    expect(session.inventory.torch).toBe(4);
  });

  it("crafts from shortcuts alone and tops up an existing output shortcut", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.hotbar[2] = { itemId: "pine_log", quantity: 1 };
    session.hotbar[4] = { itemId: "torch", quantity: 4 };
    session.selectHotbar(2);
    expect(session.startCraft("torch", 2)).toEqual({ ok: true });
    expect(session.hotbar[2]).toBeNull();
    expect(session.selectedItem).toBeNull();
    advance(session, 2 * RECIPES.torch.ticksPerItem);
    expect(session.hotbar[4]?.quantity).toBe(6);
    expect(session.inventory.torch).toBe(0);
    expect(session.crafting).toBeNull();
  });

  it("fills a shortcut then puts overflow in inventory across a save and reload", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 2;
    session.hotbar[4] = { itemId: "torch", quantity: 97, rotation: 90 };
    expect(session.startCraft("torch", 4)).toEqual({ ok: true });
    advance(session, RECIPES.torch.ticksPerItem + 30);
    expect(session.hotbar[4]?.quantity).toBe(98);
    expect(session.inventory.torch).toBe(0);
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    advance(restored, 3 * RECIPES.torch.ticksPerItem - 30);
    expect(restored.hotbar[4]).toEqual({ itemId: "torch", quantity: 99, rotation: 90 });
    expect(restored.inventory.torch).toBe(2);
    expect(restored.crafting).toBeNull();
  });

  it("accepts output space in shortcuts even when all inventory slots are occupied", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.inventory.dirt = 99 * 24;
    session.hotbar.fill(null);
    session.hotbar[2] = { itemId: "pine_log", quantity: 1 };
    session.hotbar[4] = { itemId: "torch", quantity: 97 };
    expect(session.startCraft("torch", 2)).toEqual({ ok: true });
    advance(session, 2 * RECIPES.torch.ticksPerItem);
    expect(session.hotbar[4]?.quantity).toBe(99);
    expect(session.inventory.torch).toBe(0);
    expect(session.hotbar[2]).toBeNull();
    expect(session.crafting).toBeNull();
  });

  it("rejects a batch atomically when combined storage cannot hold all outputs", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.inventory.dirt = 99 * 24;
    session.hotbar.fill(null);
    session.hotbar[2] = { itemId: "pine_log", quantity: 2 };
    session.hotbar[4] = { itemId: "torch", quantity: 98 };
    const before = session.snapshot(2000);
    expect(session.startCraft("torch", 4)).toMatchObject({ ok: false });
    expect(session.snapshot(2000)).toEqual(before);
  });

  it("waits only when both storages are full and resumes into a shortcut after reloading", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.hotbar[2] = { itemId: "pine_log", quantity: 2 };
    session.hotbar[4] = { itemId: "torch", quantity: 97 };
    expect(session.startCraft("torch", 4)).toEqual({ ok: true });
    session.inventory.dirt = 99 * 24;
    advance(session, 3 * RECIPES.torch.ticksPerItem);
    expect(session.hotbar[4]?.quantity).toBe(99);
    expect(session.craftingBlocked).toBe(true);
    expect(session.crafting).toMatchObject({ completed: 2, progressTicks: 60 });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    restored.hotbar[4] = { itemId: "torch", quantity: 98 };
    advance(restored, 1);
    expect(restored.hotbar[4]?.quantity).toBe(99);
    expect(restored.craftingBlocked).toBe(false);
    expect(restored.crafting?.completed).toBe(3);
    restored.inventory.dirt -= 99;
    advance(restored, RECIPES.torch.ticksPerItem);
    expect(restored.inventory.torch).toBe(1);
    expect(restored.crafting).toBeNull();
  });

  it("rejects invalid quantities, missing ingredients and insufficient space without consuming anything", () => {
    const session = GameSession.create("Test", "craft", 1000);
    for (const quantity of [0, -2, 1, 3, 2.5, MAX_CRAFT_QUANTITY + 1, NaN, Infinity]) {
      const before = session.snapshot(2000);
      expect(session.startCraft("torch", quantity).ok).toBe(false);
      expect(session.snapshot(2000)).toEqual(before);
    }
    session.hotbar.fill(null);
    expect(session.startCraft("ladder", 1).ok).toBe(false);
    session.inventory.dirt = 99 * 23;
    session.inventory.pine_log = 2;
    const before = session.snapshot(2000);
    expect(session.startCraft("torch", 2).ok).toBe(false);
    expect(session.snapshot(2000)).toEqual(before);
  });

  it("supports batches spanning multiple inventory stacks", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 50;
    expect(session.startCraft("torch", 100)).toEqual({ ok: true });
    advance(session, 100 * RECIPES.torch.ticksPerItem);
    expect(session.inventory.pine_log).toBe(0);
    expect(session.inventory.torch).toBe(100);
    expect(session.crafting).toBeNull();
  });

  it("cancels atomically and returns only batches that have not produced an output", () => {
    const session = GameSession.create("Test", "craft-cancel", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 2;
    expect(session.startCraft("torch", 4)).toEqual({ ok: true });
    advance(session, RECIPES.torch.ticksPerItem);
    expect(session.inventory.torch).toBe(1);
    expect(session.cancelCraft()).toEqual({ ok: true });
    expect(session.inventory.pine_log).toBe(1);
    expect(session.inventory.torch).toBe(1);
    expect(session.crafting).toBeNull();
  });

  it("refuses cancellation without losing reserved materials when the return cannot fit", () => {
    const session = GameSession.create("Test", "craft-cancel-full", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 1;
    expect(session.startCraft("torch", 2)).toEqual({ ok: true });
    session.inventory.dirt = 99 * 24;
    const before = session.snapshot(2000);
    expect(session.cancelCraft()).toMatchObject({ ok: false });
    expect(session.snapshot(2000)).toEqual(before);
  });

  it("round-trips an unfinished batch and continues without reserving or producing twice", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 1;
    expect(session.startCraft("torch", 2).ok).toBe(true);
    advance(session, 90);
    expect(session.inventory.torch).toBe(1);
    expect(session.crafting).toMatchObject({ completed: 1, progressTicks: 30 });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.inventory.pine_log).toBe(0);
    expect(restored.inventory.torch).toBe(1);
    advance(restored, 29);
    expect(restored.inventory.torch).toBe(1);
    advance(restored, 1);
    expect(restored.inventory.torch).toBe(2);
    expect(restored.crafting).toBeNull();
  });

  it("waits visibly when space fills during a batch, and resumes after saving and freeing space", () => {
    const session = GameSession.create("Test", "craft", 1000);
    session.hotbar.fill(null);
    session.hotbar[0] = { itemId: "pine_log", quantity: 1 };
    expect(session.startCraft("torch", 2).ok).toBe(true);
    session.inventory.dirt = 99 * 24;
    advance(session, RECIPES.torch.ticksPerItem);
    expect(session.craftingBlocked).toBe(true);
    expect(session.crafting).toMatchObject({ completed: 0, progressTicks: 60 });
    expect(session.inventory.torch).toBe(0);

    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.craftingBlocked).toBe(true);
    restored.inventory.dirt -= 99;
    advance(restored, 1);
    expect(restored.craftingBlocked).toBe(false);
    expect(restored.inventory.torch).toBe(1);
    advance(restored, RECIPES.torch.ticksPerItem);
    expect(restored.inventory.torch).toBe(2);
    expect(restored.crafting).toBeNull();
  });

  it("assigns longer per-item durations to more complex recipes", () => {
    const order: RecipeId[] = ["torch", "ladder", "woodStairs", "stoneStairs"];
    expect(order.map((id) => RECIPES[id].ticksPerItem)).toEqual([60, 90, 120, 180]);
  });
});

describe("craft quantity selection", () => {
  it("caps a selection using ingredients from both the bag and shortcuts", () => {
    const session = GameSession.create("Test", "craft-selection", 1000);
    session.hotbar.fill(null);
    session.inventory.pine_log = 3;
    session.hotbar[7] = { itemId: "pine_log", quantity: 2 };
    const available = (itemId: MaterialItemId): number => session.totalItems(itemId);
    expect(clampCraftQuantity(RECIPES.torch, 99, available)).toBe(10);
    expect(clampCraftQuantity(RECIPES.torch, 4, available)).toBe(4);
    session.inventory.pine_log = 0;
    expect(clampCraftQuantity(RECIPES.torch, 10, available)).toBe(4);
  });

  it("uses the limiting ingredient of a multi-material recipe", () => {
    const available = { pine_log: 12, stone: 3 };
    expect(clampCraftQuantity(RECIPES.stonePickaxe, 99, (itemId) =>
      itemId === "pine_log" ? available.pine_log : itemId === "stone" ? available.stone : 0)).toBe(3);
  });

  it("limits the slider to 99 objects while preserving full recipe batches", () => {
    expect(clampCraftQuantity(RECIPES.ladder, 200, () => 1000)).toBe(99);
    expect(clampCraftQuantity(RECIPES.torch, 99, () => 1000)).toBe(98);
    expect(clampCraftQuantity(RECIPES.torch, 3, () => 1000)).toBe(2);
    expect(clampCraftQuantity(RECIPES.torch, 1, () => 1000)).toBe(2);
  });

  it("returns zero when no full recipe can be made", () => {
    expect(clampCraftQuantity(RECIPES.torch, 2, () => 0)).toBe(0);
    expect(clampCraftQuantity(RECIPES.stonePickaxe, 5, (itemId) => itemId === "pine_log" ? 5 : 0)).toBe(0);
  });
});

describe("crafting stations and metal progression", () => {
  it.each([Block.Workbench, Block.Furnace, Block.Forge])(
    "keeps station block %s on the foreground without obstructing the player",
    (block) => {
      expect(BLOCKS[block]).toMatchObject({ solid: false });
    },
  );

  function putStation(session: GameSession, block: BlockId): void {
    const offset = block === Block.Workbench ? 1 : block === Block.Furnace ? 2 : 3;
    const x = Math.floor((session.player.x + 8) / TILE_SIZE) + offset;
    const y = Math.floor((session.player.y + 20) / TILE_SIZE);
    session.world.setBlockOnPlane(x, y, block, 0, "foreground", true);
  }

  it("requires a nearby station before reserving ingredients and keeps a started job progressing", () => {
    const session = GameSession.create("Stations", "station-test", 1000);
    session.inventory.copper_ore = 2;
    session.inventory.coal = 1;
    expect(session.startCraft("copperIngot", 1)).toMatchObject({
      ok: false, reason: expect.stringContaining("Four"),
    });
    expect(session.inventory.copper_ore).toBe(2);

    putStation(session, Block.Furnace);
    expect(session.startCraft("copperIngot", 1)).toEqual({ ok: true });
    expect(session.inventory.copper_ore).toBe(0);
    expect(session.inventory.coal).toBe(0);

    session.world.setBlockOnPlane(
      Math.floor((session.player.x + 8) / TILE_SIZE) + 2,
      Math.floor((session.player.y + 20) / TILE_SIZE),
      Block.Air, 0, "foreground", true,
    );
    advance(session, RECIPES.copperIngot.ticksPerItem);
    expect(session.inventory.copper_ingot).toBe(1);
    expect(session.crafting).toBeNull();
  });

  it("supports the complete workbench, furnace and forge progression across a reload", () => {
    const session = GameSession.create("Metals", "metal-test", 1000);
    session.inventory.pine_log = 4;
    session.inventory.stone = 8;
    session.inventory.clay = 4;
    expect(session.startCraft("workbench", 1)).toEqual({ ok: true });
    advance(session, RECIPES.workbench.ticksPerItem);
    putStation(session, Block.Workbench);
    expect(session.startCraft("furnace", 1)).toEqual({ ok: true });
    advance(session, RECIPES.furnace.ticksPerItem);
    putStation(session, Block.Furnace);

    session.inventory.copper_ore = 4;
    session.inventory.coal = 2;
    expect(session.startCraft("copperIngot", 2)).toEqual({ ok: true });
    advance(session, RECIPES.copperIngot.ticksPerItem * 2);

    session.inventory.pine_log = 1;
    expect(session.startCraft("copperPickaxe", 1)).toEqual({ ok: true });
    advance(session, RECIPES.copperPickaxe.ticksPerItem / 2);
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    advance(restored, RECIPES.copperPickaxe.ticksPerItem / 2);
    expect(restored.inventory.tools).toContainEqual({
      itemId: "copperPickaxe", quantity: 1, durability: 800,
    });
    expect(restored.canCraft("ironPickaxe")).toBe(false);

    restored.inventory.iron_ore = 8;
    restored.inventory.coal = 8;
    expect(restored.startCraft("ironIngot", 4)).toEqual({ ok: true });
    advance(restored, RECIPES.ironIngot.ticksPerItem * 4);
    restored.inventory.stone = 12;
    restored.inventory.coal = 2;
    expect(restored.startCraft("forge", 1)).toEqual({ ok: true });
    advance(restored, RECIPES.forge.ticksPerItem);
    putStation(restored, Block.Forge);
    restored.inventory.iron_ore = 6;
    restored.inventory.coal = 6;
    expect(restored.startCraft("ironIngot", 3)).toEqual({ ok: true });
    advance(restored, RECIPES.ironIngot.ticksPerItem * 3);
    restored.inventory.pine_log = 1;
    expect(restored.startCraft("ironPickaxe", 1)).toEqual({ ok: true });
    advance(restored, RECIPES.ironPickaxe.ticksPerItem);
    expect(restored.inventory.tools).toContainEqual({
      itemId: "ironPickaxe", quantity: 1, durability: 1200,
    });
  });
});
