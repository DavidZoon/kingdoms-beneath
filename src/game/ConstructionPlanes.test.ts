import { describe, expect, it, vi } from "vitest";
import { PLAYER_HEIGHT, playerOverlapsSolid } from "../player/PlayerController";
import { parseSave, serializeSave } from "../save/schema";
import { Block, TILE_SIZE } from "../world/blocks";
import { GameSession, MAX_EDITS } from "./GameSession";

function sessionWithGround(): GameSession {
  const session = GameSession.create("Test", "two-layers", 1000);
  const ground = session.world.generator.surfaceAt(8);
  for (let x = 4; x <= 14; x++) {
    for (let y = ground - 5; y < ground; y++) session.world.setBlock(x, y, Block.Air);
    session.world.setBlock(x, ground, Block.Dirt);
  }
  session.player.y = ground * TILE_SIZE - PLAYER_HEIGHT;
  return session;
}

function target(session: GameSession): { x: number; y: number } {
  return { x: 10, y: session.world.generator.surfaceAt(8) - 3 };
}

describe("construction planes", () => {
  it("requires a cardinal foreground support or a background in the same cell", () => {
    const session = sessionWithGround();
    const { x, y } = target(session);
    const before = session.hotbar[2]?.quantity;
    session.world.setBlock(x + 1, y + 1, Block.Stone);
    expect(session.place(x, y)).toMatchObject({ ok: false, reason: expect.stringContaining("support") });
    expect(session.hotbar[2]?.quantity).toBe(before);
    session.world.setBlock(x + 1, y, Block.Stone);
    expect(session.place(x, y)).toEqual({ ok: true });

    session.world.setBlock(x, y, Block.Air);
    session.world.setBackground(x, y - 1, Block.Stone);
    expect(session.place(x, y - 1)).toEqual({ ok: true });
    expect(session.world.getBlock(x, y - 1)).toBe(Block.Wood);
    expect(session.world.getBackground(x, y - 1)).toBe(Block.Stone);
  });

  it("requires cardinal background support or a foreground in the same cell", () => {
    const session = sessionWithGround();
    const { x, y } = target(session);
    session.setHotbarPlane(2, "background");
    session.world.setBackground(x + 1, y + 1, Block.Stone);
    expect(session.place(x, y)).toMatchObject({ ok: false, reason: expect.stringContaining("support") });
    session.world.setBackground(x + 1, y, Block.Stone);
    expect(session.place(x, y)).toEqual({ ok: true });
    session.world.setBackground(x, y, Block.Air);
    session.world.setBlock(x, y - 1, Block.Stone);
    expect(session.place(x, y - 1)).toEqual({ ok: true });
    expect(session.world.getBackground(x, y - 1)).toBe(Block.Wood);
    expect(session.world.getBlock(x, y - 1)).toBe(Block.Stone);
  });

  it("allows background construction behind the player but still prevents foreground entombment", () => {
    const session = sessionWithGround();
    const y = target(session).y;
    session.player.y = y * TILE_SIZE;
    session.world.setBackground(7, y, Block.Stone);
    session.setHotbarPlane(2, "background");
    expect(session.place(8, y)).toEqual({ ok: true });
    expect(playerOverlapsSolid(session.world, session.player)).toBe(false);
    session.setHotbarPlane(2, "foreground");
    expect(session.place(8, y)).toMatchObject({ ok: false, reason: expect.stringContaining("personnage") });
    expect(session.world.getBackground(8, y)).toBe(Block.Wood);
    expect(session.world.getBlock(8, y)).toBe(Block.Air);
  });

  it("lets the player walk through a background wall", () => {
    const session = sessionWithGround();
    const ground = session.world.generator.surfaceAt(8);
    session.world.setBackground(9, ground - 2, Block.Stone);
    session.world.setBackground(9, ground - 1, Block.Stone);
    for (let tick = 0; tick < 25; tick++) {
      session.step({ left: false, right: true, up: false, down: false, run: false, jump: false });
      expect(playerOverlapsSolid(session.world, session.player)).toBe(false);
    }
    expect(session.player.x).toBeGreaterThan(9 * TILE_SIZE);
  });

  it("ignores an immutable natural background without damage, drops or edits", () => {
    const session = sessionWithGround();
    const x = 10;
    const y = session.world.generator.surfaceAt(x) + 1;
    session.selectHotbar(1);
    session.setHotbarPlane(1, "background");
    expect(session.withinReach(x, y)).toBe(true);
    const before = session.snapshot(2000);
    expect(session.mine(x, y, 100)).toEqual({ ok: false, silent: true });
    expect(session.snapshot(2000)).toEqual(before);
    expect(session.getBlockDamage(x, y, "background")).toBe(0);
    session.selectHotbar(2);
    session.setHotbarPlane(2, "background");
    expect(session.place(x, y)).toMatchObject({ ok: false, reason: expect.stringContaining("occupée") });
  });

  it("mines and saves damage independently on both planes at the same coordinate", () => {
    const session = sessionWithGround();
    const { x, y } = target(session);
    session.world.setBlock(x, y, Block.Stone);
    session.world.setBackground(x, y, Block.Wood, 90);
    session.selectHotbar(1);
    expect(session.mine(x, y)).toEqual({ ok: true, destroyed: false });
    session.setHotbarPlane(1, "background");
    expect(session.mine(x, y, 2)).toEqual({ ok: true, destroyed: false });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.selectedPlane).toBe("background");
    expect(restored.getBlockDamage(x, y, "foreground")).toBe(1);
    expect(restored.getBlockDamage(x, y, "background")).toBe(2);
    expect(restored.world.getBackgroundRotation(x, y)).toBe(90);
    expect(restored.mine(x, y, 4)).toEqual({ ok: true, destroyed: true });
    expect(restored.world.getBackground(x, y)).toBe(Block.Air);
    expect(restored.world.getBlock(x, y)).toBe(Block.Stone);
    expect(restored.getBlockDamage(x, y, "foreground")).toBe(1);
    expect(restored.hotbar[2]?.quantity).toBe(25);
    expect(restored.inventory.wood).toBe(0);
  });

  it("harvests natural trunks and does not restore them after rebuilding and reloading", () => {
    const session = sessionWithGround();
    let trunk: { x: number; y: number } | null = null;
    for (let x = 14; x <= 300 && !trunk; x++) {
      const y = session.world.generator.surfaceAt(x) - 1;
      if (session.world.getBackgroundOrigin(x, y) === "trunk") trunk = { x, y };
    }
    if (!trunk) throw new Error("No generated trunk found.");
    const { x, y } = trunk;
    session.player.x = (x - 2) * TILE_SIZE;
    session.player.y = (y - 1) * TILE_SIZE;
    session.selectHotbar(1);
    session.setHotbarPlane(1, "background");
    expect(session.mine(x, y, 6)).toEqual({ ok: true, destroyed: true });
    expect(session.hotbar[2]?.quantity).toBe(25);
    expect(session.inventory.wood).toBe(0);
    expect(session.world.getBlock(x, y)).toBe(Block.Air);
    expect(session.world.getBackground(x, y)).toBe(Block.Air);
    session.selectHotbar(2);
    session.setHotbarPlane(2, "background");
    session.rotateSelected(1);
    expect(session.place(x, y)).toEqual({ ok: true });
    expect(session.world.getBackgroundOrigin(x, y)).toBe("placed");
    session.selectHotbar(1);
    expect(session.mine(x, y, 6)).toEqual({ ok: true, destroyed: true });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.world.getBackground(x, y)).toBe(Block.Air);
    expect(restored.world.backgroundEdits).toContainEqual({ x, y, block: Block.Air });
    expect(restored.hotbar[2]?.quantity).toBe(25);
    expect(restored.inventory.wood).toBe(0);
  });

  it("keeps plan choices on slots and automatically adjusts incompatible incoming stacks", () => {
    const session = sessionWithGround();
    expect(session.toggleHotbarPlane(0)).toEqual({ ok: true });
    expect(session.selectedSlot).toBe(2);
    expect(session.hotbarPlanes[0]).toBe("background");
    session.setHotbarPlane(1, "background");
    session.inventory.ladder = 5;
    expect(session.moveInventoryToHotbar(0, 1)).toEqual({ ok: true });
    expect(session.hotbarPlanes[1]).toBe("foreground");
    expect(session.toggleHotbarPlane(1)).toMatchObject({ ok: false });
    session.setHotbarPlane(8, "background");
    session.swapHotbar(3, 8);
    expect(session.hotbar[8]?.itemId).toBe("ladder");
    expect(session.hotbarPlanes[8]).toBe("foreground");
    expect(session.hotbarPlanes[3]).toBe("foreground");
  });

  it("allows removing an existing edit at the limit but rejects an additional edit atomically", () => {
    const session = sessionWithGround();
    const { x, y } = target(session);
    session.world.setBlock(x, y, Block.Stone);
    vi.spyOn(session.world, "editCount", "get").mockReturnValue(MAX_EDITS);
    session.selectHotbar(1);
    expect(session.mine(x, y, 12)).toEqual({ ok: true, destroyed: true });
    const ground = session.world.generator.surfaceAt(10) + 1;
    const before = session.inventory.dirt;
    expect(session.world.wouldAddEdit(10, ground, Block.Air, 0, "foreground")).toBe(true);
    expect(session.mine(10, ground, 4)).toMatchObject({ ok: false, reason: expect.stringContaining("Limite") });
    expect(session.inventory.dirt).toBe(before);
    expect(session.world.getBlock(10, ground)).not.toBe(Block.Air);
  });
});
