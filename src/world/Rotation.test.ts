import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { parseSave, serializeSave } from "../save/schema";
import { Block, TILE_SIZE } from "./blocks";
import { WorldModel } from "./WorldModel";

describe("piece rotation", () => {
  it("turns the selected stack in both directions and wraps at 360 degrees", () => {
    const session = GameSession.create("Test", "rotation", 1000);
    for (const angle of [90, 180, 270, 0]) {
      expect(session.rotateSelected(1)).toEqual({ ok: true });
      expect(session.selectedRotation).toBe(angle);
    }
    session.rotateSelected(-1);
    expect(session.selectedRotation).toBe(270);
    session.selectHotbar(0);
    expect(session.selectedRotation).toBe(0);
    session.selectHotbar(1);
    expect(session.rotateSelected(1)).toMatchObject({ ok: false });
  });

  it.each([0, 90, 180, 270] as const)("places and saves an oriented piece at %s degrees", (rotation) => {
    const session = GameSession.create("Test", "rotation", 1000);
    session.hotbar[2] = { itemId: "woodStairs", quantity: 2, ...(rotation ? { rotation } : {}) };
    const x = 10;
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(x, y, Block.Air);
    session.world.setBlock(x + 1, y, Block.Stone);
    expect(session.place(x, y)).toEqual({ ok: true });
    expect(session.world.getRotation(x, y)).toBe(rotation);
    const loaded = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(loaded.selectedRotation).toBe(rotation);
    expect(loaded.hotbar[2]?.quantity).toBe(1);
    expect(loaded.world.getBlock(x, y)).toBe(Block.WoodStairs);
    expect(loaded.world.getRotation(x, y)).toBe(rotation);
    expect(loaded.mine(x, y, 6)).toMatchObject({ ok: true, destroyed: true });
    expect(loaded.world.getRotation(x, y)).toBe(0);
  });

  it("retains a rotated generated block as an edit and invalidates its revision", () => {
    const world = new WorldModel("rotation");
    const y = world.generator.surfaceAt(10);
    const block = world.getBlock(10, y);
    const revision = world.revision;
    world.setBlock(10, y, block, 90);
    expect(world.revision).toBe(revision + 1);
    expect(world.edits).toEqual([{ x: 10, y, block, rotation: 90 }]);
    world.setBlock(10, y, block);
    expect(world.revision).toBe(revision + 2);
    expect(world.edits).toEqual([]);
  });
});
