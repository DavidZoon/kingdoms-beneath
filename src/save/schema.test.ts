import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { Block, TILE_SIZE } from "../world/blocks";
import { MAX_SAVE_BYTES, parseSave, serializeSave, validateSave } from "./schema";
import { emptyInventory, getStacks } from "../inventory/Inventory";

const fixture = () => GameSession.create("Les profondeurs", "seed-test", 1000).snapshot(2000);

function v4Fixture() {
  return {
    ...fixture(), schemaVersion: 4, generatorVersion: 2, selectedItem: "wood",
    inventory: { dirt: 12, stone: 0, wood: 24, ladder: 6, torch: 4 },
  };
}

interface LegacySaveFixture {
  schemaVersion: number;
  generatorVersion: number;
  groundDrops?: unknown;
  player: Record<string, unknown>;
  inventory: Record<string, unknown>;
}

function legacyFixture(): LegacySaveFixture {
  return JSON.parse(JSON.stringify(v4Fixture())) as LegacySaveFixture;
}

describe("local save file validation", () => {
  it("migrates v9 saves without changing their resources or generator", () => {
    const save = fixture();
    const { collectedPlants: _plants, ...previous } = save;
    expect(validateSave({ ...previous, schemaVersion: 9, generatorVersion: 4 })).toEqual({ ...save, generatorVersion: 4 });
    expect(() => validateSave({ ...previous, schemaVersion: 9 })).toThrow(/Version/);
  });

  it("rejects invalid, duplicate or nonexistent plant harvest records", () => {
    const save = fixture();
    for (const collectedPlants of [
      null, ["plant:8,20:cotton_plant"], ["plant:8,20:fur"],
      ["plant:8,20:lavender", "plant:8,20:lavender"],
    ]) expect(() => validateSave({ ...save, collectedPlants })).toThrow(/plante/i);
  });

  it("migrates old wood in inventories, shortcuts, drops and edits while preserving their generator", () => {
    const save = fixture();
    const { pine_log: _pine, ...inventory } = save.inventory;
    const migrated = validateSave({
      ...save, schemaVersion: 8, generatorVersion: 3, inventory: { ...inventory, wood: 4 },
      hotbar: [{ itemId: "wood", quantity: 2, rotation: 90 }, ...Array(9).fill(null)],
      edits: [{ x: 20, y: 20, block: 4 }],
      groundDrops: [{ id: "old-wood", x: 200, y: 200, itemId: "wood", quantity: 3 }],
    });
    expect(migrated.generatorVersion).toBe(3);
    expect(migrated.inventory.pine_log).toBe(4);
    expect(migrated.hotbar[0]).toEqual({ itemId: "pine_log", quantity: 2, rotation: 90 });
    expect(migrated.groundDrops[0].itemId).toBe("pine_log");
    expect(new GameSession(migrated).world.getBlock(20, 20)).toBe(Block.PineLog);
  });

  it("rejects malformed new resource quantities and nonexistent pickup records", () => {
    const save = fixture();
    expect(() => validateSave({ ...save, inventory: { ...save.inventory, oak_log: -1 } })).toThrow();
    const { fur: _fur, ...inventory } = save.inventory;
    expect(() => validateSave({ ...save, inventory })).toThrow();
    expect(() => validateSave({ ...save, collectedNaturalPickups: ["natural:8,20:fish_raw"] })).toThrow(/naturelle/);
    expect(() => validateSave({ ...save, hotbar: [{ itemId: "wood", quantity: 1 }, ...Array(9).fill(null)] })).toThrow();
  });

  it("round-trips a complete supported save", () => {
    const save = fixture();
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it.each([
    ["format", "other-game"],
    ["schemaVersion", 11],
    ["generatorVersion", 6],
    ["name", ""],
    ["id", "../not-a-filename"],
    ["tick", -1],
    ["updatedAt", 1],
    ["selectedSlot", 10],
    ["hotbar", []],
    ["crafting", undefined],
    ["edits", null],
    ["player", { x: Infinity, y: 1 }],
    ["inventory", { dirt: -1, stone: 0, pine_log: 0 }],
    ["creativeMode", "yes"],
    ["blockDamage", null],
    ["lightingQuality", "ultra"],
    ["collectedPlants", undefined],
  ])("rejects invalid %s without filling in defaults", (key, value) => {
    expect(() => validateSave({ ...fixture(), [key]: value })).toThrow();
  });

  it("rejects invalid cells and duplicate coordinates", () => {
    const save = fixture();
    expect(() => validateSave({ ...save, edits: [{ x: 0, y: 20, block: 100 }] })).toThrow(/terrain/);
    expect(() => validateSave({ ...save, edits: [
      { x: 0, y: 20, block: 0 }, { x: 0, y: 20, block: 1 },
    ] })).toThrow(/dupliquées/);
  });

  it("rejects an imported player inside a solid block", () => {
    const save = fixture();
    save.edits.push({ x: Math.floor(save.player.x / TILE_SIZE), y: Math.floor(save.player.y / TILE_SIZE), block: 2 });
    expect(() => validateSave(save)).toThrow(/bloqué/);
  });

  it("rejects malformed or oversized JSON", () => {
    expect(() => parseSave("{not JSON}")).toThrow(/JSON/);
    expect(() => parseSave(" ".repeat(MAX_SAVE_BYTES + 1))).toThrow(/10 Mo/);
  });

  it("migrates a v1 save while keeping its generator and inventory", () => {
    const legacy = legacyFixture();
    legacy.schemaVersion = 1;
    legacy.generatorVersion = 1;
    delete legacy.groundDrops;
    delete legacy.player.climbing;
    delete legacy.inventory.ladder;
    delete legacy.inventory.torch;
    const migrated = parseSave(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.generatorVersion).toBe(1);
    expect(migrated.inventory).toEqual(emptyInventory());
    expect(migrated.hotbar[0]).toEqual({ itemId: "dirt", quantity: 12 });
    expect(migrated.hotbar[2]).toEqual({ itemId: "pine_log", quantity: 24 });
    expect(migrated.selectedSlot).toBe(2);
    expect(migrated.groundDrops).toEqual([]);
    expect(migrated.creativeMode).toBe(false);
    expect(migrated.blockDamage).toEqual([]);
    expect(migrated.lightingQuality).toBe("standard");
  });

  it("moves v1 inventory overflow into persistent ground stacks", () => {
    const legacy = legacyFixture();
    legacy.schemaVersion = 1;
    legacy.generatorVersion = 1;
    delete legacy.groundDrops;
    delete legacy.player.climbing;
    delete legacy.inventory.ladder;
    legacy.inventory = { dirt: 9999, stone: 9999, wood: 9999 };
    const migrated = validateSave(legacy);
    const dropped = migrated.groundDrops.reduce((sum, drop) => sum + drop.quantity, 0);
    const carried = getStacks(migrated.inventory).reduce((sum, stack) => sum + stack.quantity, 0) +
      migrated.hotbar.reduce((sum, stack) => sum + (stack?.quantity ?? 0), 0);
    expect(dropped + carried).toBe(29_997);
    expect(migrated.groundDrops.length).toBeGreaterThan(0);
  });

  it("migrates v2 saves without enabling creative mode or changing the generator", () => {
    const { creativeMode: _creative, blockDamage: _damage, lightingQuality: _quality, ...previous } = v4Fixture();
    const { torch: _torch, ...inventory } = previous.inventory;
    const migrated = validateSave({ ...previous, schemaVersion: 2, inventory });
    expect(migrated.creativeMode).toBe(false);
    expect(migrated.blockDamage).toEqual([]);
    expect(migrated.generatorVersion).toBe(previous.generatorVersion);
    expect(migrated.hotbar[0]).toEqual({ itemId: "dirt", quantity: 12 });
    expect(migrated.hotbar[2]).toEqual({ itemId: "pine_log", quantity: 24 });
    expect(migrated.hotbar[4]).toBeNull();
    expect(migrated.lightingQuality).toBe("standard");
  });

  it("migrates v3 without losing edits, damage, drops, creative mode or tick", () => {
    const save = v4Fixture();
    const y = Math.floor(save.player.y / TILE_SIZE);
    save.creativeMode = true;
    save.tick = 12345;
    save.edits.push({ x: 10, y, block: Block.Stone });
    save.blockDamage.push({ x: 10, y, damage: 4, plane: "foreground" });
    save.groundDrops.push({ id: "drop-1", x: 200, y: y * TILE_SIZE, itemId: "pine_log", quantity: 3 });
    const { lightingQuality: _quality, ...previous } = save;
    const { torch: _torch, ...inventory } = previous.inventory;
    const migrated = parseSave(JSON.stringify({ ...previous, schemaVersion: 3, inventory }));
    expect(migrated).toMatchObject({
      schemaVersion: 10, generatorVersion: save.generatorVersion, tick: save.tick,
      edits: save.edits, blockDamage: save.blockDamage, groundDrops: save.groundDrops,
      creativeMode: true, lightingQuality: "standard", selectedSlot: 2,
    });
    expect(migrated.hotbar[2]).toEqual({ itemId: "pine_log", quantity: inventory.wood });
    expect(migrated.hotbar[4]).toBeNull();
  });

  it("rejects missing v4 fields and torch references in older formats", () => {
    const save = v4Fixture();
    const { torch: _torch, ...inventory } = save.inventory;
    const { lightingQuality: _quality, ...withoutQuality } = save;
    expect(() => validateSave({ ...save, inventory })).toThrow(/Inventaire/);
    expect(() => validateSave(withoutQuality)).toThrow(/éclairage/);
    const old = { ...withoutQuality, schemaVersion: 3, inventory };
    expect(() => validateSave({ ...old, selectedItem: "torch" })).toThrow();
    expect(() => validateSave({
      ...old, edits: [{ x: 10, y: 10, block: Block.Torch }],
    })).toThrow();
    expect(() => validateSave({
      ...old, groundDrops: [{ id: "torch-1", x: 100, y: 100, itemId: "torch", quantity: 1 }],
    })).toThrow();
  });

  it("migrates v4 stacks and the selected torch without duplicating resources", () => {
    const old = v4Fixture();
    old.selectedItem = "torch";
    old.inventory.dirt = 100;
    old.inventory.wood = 150;
    const migrated = validateSave(old);
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.selectedSlot).toBe(4);
    expect(migrated.hotbar).toHaveLength(10);
    expect(migrated.hotbar[0]).toEqual({ itemId: "dirt", quantity: 99 });
    expect(migrated.hotbar[2]).toEqual({ itemId: "pine_log", quantity: 99 });
    expect(migrated.hotbar[4]).toEqual({ itemId: "torch", quantity: 4 });
    expect(migrated.inventory.dirt).toBe(1);
    expect(migrated.inventory.pine_log).toBe(51);
    expect(migrated.crafting).toBeNull();
  });

  it("rejects invalid v5 shortcut stacks, craft jobs and stair references in v4", () => {
    const save = fixture();
    for (const stack of [
      { itemId: "gold", quantity: 1 }, { itemId: "pine_log", quantity: 0 },
      { itemId: "pine_log", quantity: 100 }, { itemId: "pine_log", quantity: 1.5 },
    ]) {
      expect(() => validateSave({ ...save, hotbar: [stack, ...Array(9).fill(null)] })).toThrow(/raccourci/);
    }
    for (const crafting of [
      { recipeId: "gold", quantity: 1, completed: 0, progressTicks: 0 },
      { recipeId: "torch", quantity: 3, completed: 0, progressTicks: 0 },
      { recipeId: "torch", quantity: 2, completed: 2, progressTicks: 0 },
      { recipeId: "torch", quantity: 2, completed: 0, progressTicks: 61 },
    ]) {
      expect(() => validateSave({ ...save, crafting })).toThrow(/Fabrication/);
    }
    const old = v4Fixture();
    expect(() => validateSave({ ...old, selectedItem: "woodStairs" })).toThrow();
    expect(() => validateSave({
      ...old, edits: [{ x: 10, y: 10, block: Block.StoneStairs }],
    })).toThrow(/terrain/);
    expect(() => validateSave({
      ...old, groundDrops: [{ id: "stair-1", x: 100, y: 100, itemId: "woodStairs", quantity: 1 }],
    })).toThrow(/déposé/);
  });

  it("rejects duplicated, excessive, air and indestructible block damage", () => {
    const save = fixture();
    const y = Math.floor(save.player.y / TILE_SIZE);
    save.edits.push({ x: 10, y, block: 3 });
    for (const blockDamage of [
      [{ x: 10, y, damage: 12, plane: "foreground" }],
      [{ x: 10, y, damage: 0, plane: "foreground" }],
      [{ x: 10, y, damage: 1, plane: "foreground" }, { x: 10, y, damage: 2, plane: "foreground" }],
      [{ x: 10, y: 0, damage: 1, plane: "foreground" }],
      [{ x: 10, y: 95, damage: 1, plane: "foreground" }],
    ]) {
      expect(() => validateSave({ ...save, blockDamage })).toThrow(/urabilité/);
    }
  });

  it("migrates v5 without changing stacks, crafting or world edits", () => {
    const save = fixture();
    save.inventory.woodStairs = 12;
    save.crafting = { recipeId: "torch", quantity: 4, completed: 1, progressTicks: 30 };
    save.edits.push({ x: 10, y: 20, block: Block.WoodStairs });
    const migrated = validateSave({ ...save, schemaVersion: 5, generatorVersion: 2 });
    expect(migrated).toEqual({ ...save, generatorVersion: 2 });
    const session = new GameSession(migrated);
    expect(session.selectedRotation).toBe(0);
    expect(session.world.getRotation(10, 20)).toBe(0);
  });

  it.each([-90, 45, 360, 1.5, null, "90"])("rejects an invalid piece angle: %s", (rotation) => {
    const save = fixture();
    expect(() => validateSave({
      ...save, hotbar: [{ itemId: "pine_log", quantity: 1, rotation }, ...Array(9).fill(null)],
    })).toThrow(/Rotation/);
    expect(() => validateSave({
      ...save, edits: [{ x: 10, y: 20, block: Block.WoodStairs, rotation }],
    })).toThrow(/Rotation/);
  });

  it("rejects a rotated air cell", () => {
    expect(() => validateSave({
      ...fixture(), edits: [{ x: 10, y: 20, block: Block.Air, rotation: 90 }],
    })).toThrow(/Rotation/);
  });

  it("migrates v6 rotations and damage without adding natural backgrounds", () => {
    const save = fixture();
    save.hotbar[2] = { itemId: "pine_log", quantity: 24, rotation: 90 };
    save.edits.push({ x: 20, y: 20, block: Block.Stone, rotation: 270 });
    const migrated = validateSave({
      ...save, schemaVersion: 6, generatorVersion: 2,
      blockDamage: [{ x: 20, y: 20, damage: 3 }],
    });
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.generatorVersion).toBe(2);
    expect(migrated.hotbar[2]?.rotation).toBe(90);
    expect(migrated.edits[0].rotation).toBe(270);
    expect(migrated.blockDamage).toEqual([{ x: 20, y: 20, damage: 3, plane: "foreground" }]);
    expect(migrated.hotbarPlanes).toEqual(Array(10).fill("foreground"));
    expect(new GameSession(migrated).world.getBackground(20, 50)).toBe(Block.Air);
    expect(() => validateSave({ ...save, schemaVersion: 6, generatorVersion: 3 })).toThrow(/Version/);
  });

  it("round-trips both plans, rotations and independent damage at one coordinate", () => {
    const save = fixture();
    save.hotbarPlanes[1] = "background";
    save.edits.push({ x: 20, y: 20, block: Block.Stone, rotation: 90 });
    save.backgroundEdits.push({ x: 20, y: 20, block: Block.PineLog, rotation: 270 });
    save.blockDamage.push({ x: 20, y: 20, damage: 1, plane: "foreground" });
    save.blockDamage.push({ x: 20, y: 20, damage: 2, plane: "background" });
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it("rejects invalid layer state, edits to natural backgrounds and incompatible pieces", () => {
    const session = GameSession.create("Test", "seed-test", 1000);
    const save = session.snapshot(2000);
    const naturalY = session.world.generator.surfaceAt(10) + 1;
    for (const hotbarPlanes of [[], Array(10).fill("sideways"),
      ["foreground", "foreground", "foreground", "background", ...Array(6).fill("foreground")]]) {
      expect(() => validateSave({ ...save, hotbarPlanes })).toThrow(/Plan/);
    }
    for (const backgroundEdits of [
      [{ x: 10, y: naturalY, block: Block.Air }],
      [{ x: 10, y: naturalY, block: Block.PineLog }],
      [{ x: 20, y: 20, block: Block.Torch }],
      [{ x: 20, y: 20, block: Block.Ladder }],
      [{ x: 20, y: 20, block: Block.Air }],
      [{ x: 20, y: 20, block: Block.PineLog }, { x: 20, y: 20, block: Block.Dirt }],
    ]) {
      expect(() => validateSave({ ...save, backgroundEdits })).toThrow(/arrière-plan/);
    }
    expect(() => validateSave({
      ...save, blockDamage: [{ x: 10, y: naturalY, damage: 1, plane: "background" }],
    })).toThrow(/urabilité/);
  });
});
