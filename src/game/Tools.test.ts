import { describe, expect, it } from "vitest";
import { addItems, availableItemSpace, emptyInventory, getStacks } from "../inventory/Inventory";
import { PLAYER_HEIGHT } from "../player/PlayerController";
import { parseSave, serializeSave, validateSave } from "../save/schema";
import { Block, TILE_SIZE, TOOLS, type ToolStack } from "../world/blocks";
import { RECIPES } from "../crafting/Recipes";
import { GameSession } from "./GameSession";

const idle = { left: false, right: false, jump: false, run: false, up: false, down: false };
const pickaxe = (durability = 500): ToolStack => ({ itemId: "stonePickaxe", quantity: 1, durability });

function sessionWithTool(durability = 500): GameSession {
  const session = GameSession.create("Outils", "two-layers", 1000);
  const ground = session.world.generator.surfaceAt(8);
  for (let x = 4; x <= 14; x++) {
    for (let y = ground - 5; y < ground; y++) session.world.setBlock(x, y, Block.Air);
    session.world.setBlock(x, ground, Block.Dirt);
  }
  session.player.y = ground * TILE_SIZE - PLAYER_HEIGHT;
  session.hotbar.fill(null);
  session.hotbar[2] = pickaxe(durability);
  return session;
}

describe("non-stackable tools and stone pickaxes", () => {
  it("allocates one inventory slot per new tool and never fills a matching shortcut", () => {
    const inventory = emptyInventory();
    const hotbar = [pickaxe(123), null];
    expect(TOOLS.stonePickaxe.category).toBe("tools");
    expect(availableItemSpace(inventory, "stonePickaxe", hotbar)).toBe(24);
    expect(addItems(inventory, "stonePickaxe", 30, hotbar)).toBe(24);
    expect(getStacks(inventory)).toHaveLength(24);
    expect(inventory.tools.every((tool) => tool.quantity === 1 && tool.durability === 500)).toBe(true);
    expect(hotbar[0]).toEqual(pickaxe(123));
    expect(addItems(inventory, "dirt", 1)).toBe(0);
    expect(addItems(inventory, "stonePickaxe", 1)).toBe(0);
  });

  it("shares the 24 slots with materials", () => {
    const inventory = { ...emptyInventory(), dirt: 99 * 23 };
    expect(addItems(inventory, "stonePickaxe", 2)).toBe(1);
    expect(getStacks(inventory)).toHaveLength(24);
    expect(addItems(inventory, "dirt", 1)).toBe(0);
  });

  it("swaps matching tools instead of merging and preserves each durability", () => {
    const session = sessionWithTool(100);
    session.inventory.tools.push(pickaxe(250), pickaxe(400));
    expect(session.moveInventoryToHotbar(0, 2)).toEqual({ ok: true });
    expect(session.hotbar[2]).toEqual(pickaxe(250));
    expect(session.inventory.tools).toEqual([pickaxe(400), pickaxe(100)]);
    session.hotbar[5] = pickaxe(450);
    expect(session.swapHotbar(2, 5)).toEqual({ ok: true });
    expect(session.hotbar[2]).toEqual(pickaxe(450));
    expect(session.hotbar[5]).toEqual(pickaxe(250));
    expect(session.moveHotbarToInventory(5)).toEqual({ ok: true });
    expect(session.inventory.tools).toEqual([pickaxe(400), pickaxe(100), pickaxe(250)]);
    expect(session.totalItems("stonePickaxe")).toBe(4);
  });

  it("rejects a move to a full inventory without changing either storage", () => {
    const session = sessionWithTool(200);
    session.inventory.dirt = 99 * 24;
    const before = session.snapshot(2000);
    expect(session.moveHotbarToInventory(2).ok).toBe(false);
    expect(session.snapshot(2000)).toEqual(before);
  });

  it.each(["foreground", "background"] as const)("mines %s for two damage and one tool durability per hit", (plane) => {
    const session = sessionWithTool();
    const y = session.world.generator.surfaceAt(8) - 3;
    session.world.setBlockOnPlane(10, y, Block.Stone, 0, plane);
    expect(session.setHotbarPlane(2, plane)).toEqual({ ok: true });
    for (let hit = 1; hit < 6; hit++) {
      expect(session.mine(10, y)).toEqual({ ok: true, destroyed: false });
      expect(session.getBlockDamage(10, y, plane)).toBe(hit * 2);
      expect(session.hotbar[2]).toEqual(pickaxe(500 - hit));
    }
    expect(session.mine(10, y)).toEqual({ ok: true, destroyed: true });
    expect(session.world.getBlockOnPlane(10, y, plane)).toBe(Block.Air);
    expect(session.hotbar[2]).toEqual(pickaxe(494));
    expect(session.totalItems("stone")).toBe(1);
  });

  it("is neither placeable nor rotatable", () => {
    const session = sessionWithTool();
    const before = session.snapshot(2000);
    const y = session.world.generator.surfaceAt(8) - 3;
    expect(session.place(10, y).ok).toBe(false);
    expect(session.rotateSelected(1).ok).toBe(false);
    expect(session.snapshot(2000)).toEqual(before);
    expect(session.toggleHotbarPlane(2)).toEqual({ ok: true });
    expect(session.selectedPlane).toBe("background");
  });

  it("does not wear on air, out-of-range or immutable natural backgrounds", () => {
    const session = sessionWithTool();
    const ground = session.world.generator.surfaceAt(8);
    expect(session.mine(10, ground - 3).ok).toBe(false);
    expect(session.mine(1000, ground).ok).toBe(false);
    session.setHotbarPlane(2, "background");
    expect(session.mine(8, ground + 1)).toEqual({ ok: false, silent: true });
    expect(session.hotbar[2]).toEqual(pickaxe());
  });

  it("lasts exactly 500 successful blows and applies the final blow before breaking", () => {
    const session = sessionWithTool();
    const y = session.world.generator.surfaceAt(8) - 3;
    for (let hit = 1; hit <= 500; hit++) {
      if (session.world.getBlock(10, y) === Block.Air) session.world.setBlock(10, y, Block.Stone);
      const result = session.mine(10, y);
      expect(result.ok).toBe(true);
      if (hit < 500) expect(session.hotbar[2]).toEqual(pickaxe(500 - hit));
      else expect(result).toMatchObject({ toolBroken: true });
    }
    expect(session.hotbar[2]).toBeNull();
    expect(session.selectedItem).toBeNull();
    const damage = session.getBlockDamage(10, y);
    expect(session.mine(10, y)).toEqual({ ok: true, destroyed: false });
    expect(session.getBlockDamage(10, y)).toBe(damage + 1);
  });

  it("drops, saves and picks up a worn tool without repairing or stacking it", () => {
    const session = sessionWithTool(317);
    session.hotbar[6] = pickaxe(42);
    expect(session.dropSelectedItem()).toEqual({ ok: true });
    expect(session.hotbar[2]).toBeNull();
    expect(session.groundDrops[0]).toMatchObject(pickaxe(317));
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    const drop = restored.groundDrops[0];
    restored.player.x = drop.x - 6;
    restored.step(idle);
    expect(restored.groundDrops).toHaveLength(0);
    expect(restored.inventory.tools).toEqual([pickaxe(317)]);
    expect(restored.hotbar[6]).toEqual(pickaxe(42));
  });

  it("keeps a ground tool unchanged when no inventory slot is available", () => {
    const session = sessionWithTool(77);
    session.inventory.dirt = 99 * 24;
    session.dropSelectedItem();
    session.player.x = session.groundDrops[0].x - 6;
    session.step(idle);
    expect(session.groundDrops[0]).toMatchObject(pickaxe(77));
    expect(session.inventory.tools).toEqual([]);
  });

  it("crafts individual full-durability tools using wood and stone from either storage", () => {
    const session = sessionWithTool(300);
    session.hotbar[0] = { itemId: "wood", quantity: 1 };
    session.hotbar[1] = { itemId: "stone", quantity: 2 };
    session.inventory.wood = 1;
    expect(session.startCraft("stonePickaxe", 2)).toEqual({ ok: true });
    expect(session.totalItems("wood")).toBe(0);
    expect(session.totalItems("stone")).toBe(0);
    for (let tick = 0; tick < RECIPES.stonePickaxe.ticksPerItem; tick++) session.step(idle);
    expect(session.inventory.tools).toEqual([pickaxe()]);
    expect(session.crafting?.completed).toBe(1);
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    for (let tick = 0; tick < RECIPES.stonePickaxe.ticksPerItem; tick++) restored.step(idle);
    expect(restored.inventory.tools).toEqual([pickaxe(), pickaxe()]);
    expect(restored.hotbar[2]).toEqual(pickaxe(300));
    expect(restored.crafting).toBeNull();
  });

  it("rejects crafting when materials or one slot per tool are missing", () => {
    const session = sessionWithTool();
    session.inventory.wood = 1;
    expect(session.startCraft("stonePickaxe", 1).ok).toBe(false);
    session.inventory.stone = 1;
    session.inventory.dirt = 99 * 24 - 1;
    const before = session.snapshot(2000);
    expect(session.startCraft("stonePickaxe", 1).ok).toBe(false);
    expect(session.snapshot(2000)).toEqual(before);
  });

  it("deep-copies tool instances in sessions and snapshots", () => {
    const session = sessionWithTool();
    session.inventory.tools.push(pickaxe(300));
    const save = session.snapshot(2000);
    const restored = new GameSession(save);
    save.inventory.tools[0].durability = 123;
    restored.inventory.tools[0].durability = 200;
    expect(session.inventory.tools[0]).toEqual(pickaxe(300));
  });

  it("migrates v7 storage without losing the world and enables the tools category", () => {
    const save = sessionWithTool().snapshot(2000);
    save.hotbar[2] = null;
    const { tools: _tools, ...inventory } = save.inventory;
    const migrated = validateSave({ ...save, schemaVersion: 7, inventory });
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.inventory.tools).toEqual([]);
    expect(migrated.edits).toEqual(save.edits);
    expect(migrated.backgroundEdits).toEqual(save.backgroundEdits);
  });

  it.each([
    { quantity: 2 }, { durability: 0 }, { durability: -1 }, { durability: 501 },
    { durability: 1.5 }, { durability: undefined }, { rotation: 90 },
  ])("rejects invalid tool instances in every storage: %j", (change) => {
    const save = sessionWithTool().snapshot(2000);
    const invalid = { ...pickaxe(), ...change };
    expect(() => validateSave({ ...save, hotbar: [invalid, ...Array(9).fill(null)] })).toThrow();
    expect(() => validateSave({ ...save, inventory: { ...save.inventory, tools: [invalid] } })).toThrow();
    expect(() => validateSave({
      ...save, groundDrops: [{ ...invalid, id: "tool-drop", x: 200, y: 200 }],
    })).toThrow();
  });

  it("rejects tools in old formats and material items in tool storage", () => {
    const save = sessionWithTool().snapshot(2000);
    expect(() => validateSave({ ...save, schemaVersion: 7 })).toThrow();
    expect(() => validateSave({
      ...save, inventory: { ...save.inventory, tools: [{ itemId: "wood", quantity: 1 }] },
    })).toThrow();
    expect(() => validateSave({
      ...save, inventory: { ...save.inventory, tools: Array.from({ length: 25 }, () => pickaxe()) },
    })).toThrow();
  });
});
