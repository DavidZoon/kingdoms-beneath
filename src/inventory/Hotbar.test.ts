import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { carriedTorchSource } from "../lighting/LightField";
import { parseSave, serializeSave } from "../save/schema";
import { Block, TILE_SIZE } from "../world/blocks";
import { HOTBAR_SLOT_COUNT } from "./Inventory";

describe("shortcut stacks", () => {
  it("starts with ten independent slots, including empty ones", () => {
    const session = GameSession.create("Test", "hotbar", 1000);
    expect(session.hotbar).toHaveLength(HOTBAR_SLOT_COUNT);
    expect(session.hotbar.filter((stack) => stack === null)).toHaveLength(6);
    expect(session.selectedItem).toBe("wood");
    expect(session.totalItems("wood")).toBe(24);
  });

  it("moves an inventory stack and returns the displaced stack without losing resources", () => {
    const session = GameSession.create("Test", "hotbar", 1000);
    session.inventory.stone = 120;
    expect(session.moveInventoryToHotbar(0, 2)).toEqual({ ok: true });
    expect(session.hotbar[2]).toEqual({ itemId: "stone", quantity: 99 });
    expect(session.inventory.stone).toBe(21);
    expect(session.inventory.wood).toBe(24);
    expect(session.totalItems("stone")).toBe(120);
    expect(session.totalItems("wood")).toBe(24);

    expect(session.moveHotbarToInventory(2)).toEqual({ ok: true });
    expect(session.hotbar[2]).toBeNull();
    expect(session.inventory.stone).toBe(120);
    expect(session.selectedItem).toBeNull();
  });

  it("does not partially move a shortcut stack into a full inventory", () => {
    const session = GameSession.create("Test", "hotbar", 1000);
    session.inventory.dirt = 99 * 23;
    session.inventory.wood = 98;
    const before = session.snapshot(2000);
    expect(session.moveHotbarToInventory(2)).toMatchObject({ ok: false });
    expect(session.snapshot(2000)).toEqual(before);
  });

  it("supports rearranging and persisting shortcut stacks and an empty selection", () => {
    const session = GameSession.create("Test", "hotbar", 1000);
    expect(session.swapHotbar(2, 9)).toEqual({ ok: true });
    expect(session.selectHotbar(2)).toEqual({ ok: true });
    expect(session.selectedItem).toBeNull();
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.selectedSlot).toBe(2);
    expect(restored.selectedItem).toBeNull();
    expect(restored.hotbar[9]).toEqual({ itemId: "wood", quantity: 24 });
    expect(restored.selectHotbar(10).ok).toBe(false);
    expect(restored.swapHotbar(-1, 0).ok).toBe(false);
    expect(restored.moveInventoryToHotbar(24, 0).ok).toBe(false);
  });

  it("clears the last selected torch when placed or dropped, immediately extinguishing its carried light", () => {
    const session = GameSession.create("Test", "hotbar", 1000);
    session.hotbar[4] = { itemId: "torch", quantity: 1 };
    session.selectHotbar(4);
    expect(carriedTorchSource(session.player, session.selectedItem)).not.toBeNull();
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(10, y, Block.Air);
    session.world.setBlock(11, y, Block.Stone);
    expect(session.place(10, y)).toEqual({ ok: true });
    expect(session.hotbar[4]).toBeNull();
    expect(carriedTorchSource(session.player, session.selectedItem)).toBeNull();

    session.hotbar[4] = { itemId: "torch", quantity: 1 };
    expect(session.dropSelectedItem()).toEqual({ ok: true });
    expect(session.hotbar[4]).toBeNull();
    expect(session.groundDrops[0]).toMatchObject({ itemId: "torch", quantity: 1 });
    expect(carriedTorchSource(session.player, session.selectedItem)).toBeNull();
  });

  it.each([
    [20, 30, 50, 0], [90, 99, 99, 90], [99, 12, 99, 12],
  ])("merges inventory into a matching shortcut (%s + %s)", (target, source, merged, overflow) => {
    const session = GameSession.create("Test", "merge", 1000);
    session.hotbar[2] = { itemId: "wood", quantity: target, rotation: 90 };
    session.inventory.wood = source;
    const total = session.totalItems("wood");
    expect(session.moveInventoryToHotbar(0, 2)).toEqual({ ok: true });
    expect(session.hotbar[2]).toEqual({ itemId: "wood", quantity: merged, rotation: 90 });
    expect(session.inventory.wood).toBe(overflow);
    expect(session.totalItems("wood")).toBe(total);
  });

  it.each([
    [20, 30, 50, 0], [90, 99, 99, 90], [99, 12, 99, 12],
  ])("merges two matching shortcuts (%s + %s), returning the overflow", (target, source, merged, overflow) => {
    const session = GameSession.create("Test", "merge", 1000);
    session.hotbar[2] = { itemId: "wood", quantity: target, rotation: 270 };
    session.hotbar[8] = { itemId: "wood", quantity: source, rotation: 90 };
    const total = session.totalItems("wood");
    expect(session.swapHotbar(8, 2)).toEqual({ ok: true });
    expect(session.hotbar[8]).toBeNull();
    expect(session.hotbar[2]).toEqual({ itemId: "wood", quantity: merged, rotation: 270 });
    expect(session.inventory.wood).toBe(overflow);
    expect(session.totalItems("wood")).toBe(total);
  });

  it("rejects a merge atomically if its overflow cannot fit, but allows a merge without overflow", () => {
    const session = GameSession.create("Test", "merge", 1000);
    session.inventory.dirt = 24 * 99;
    session.hotbar[2] = { itemId: "wood", quantity: 90, rotation: 180 };
    session.hotbar[8] = { itemId: "wood", quantity: 20 };
    const before = session.snapshot(2000);
    expect(session.swapHotbar(8, 2)).toMatchObject({ ok: false, reason: expect.stringContaining("surplus") });
    expect(session.snapshot(2000)).toEqual(before);
    session.hotbar[8] = { itemId: "wood", quantity: 9 };
    expect(session.swapHotbar(8, 2)).toEqual({ ok: true });
    expect(session.hotbar[2]?.quantity).toBe(99);
    expect(session.hotbar[8]).toBeNull();
    expect(session.swapHotbar(2, 2)).toEqual({ ok: true });
    expect(session.hotbar[2]?.quantity).toBe(99);
  });

  it("keeps a stack's rotation when swapping, and merges it back into inventory by item type", () => {
    const session = GameSession.create("Test", "merge", 1000);
    session.rotateSelected(1);
    session.swapHotbar(2, 9);
    expect(session.hotbar[9]?.rotation).toBe(90);
    session.inventory.wood = 98;
    expect(session.moveHotbarToInventory(9)).toEqual({ ok: true });
    expect(session.hotbar[9]).toBeNull();
    expect(session.inventory.wood).toBe(122);
  });
});
