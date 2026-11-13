import { describe, expect, it, vi } from "vitest";
import { PLAYER_HEIGHT, PLAYER_WIDTH, playerOverlapsSolid } from "../player/PlayerController";
import { parseSave, serializeSave } from "../save/schema";
import { Block, TILE_SIZE } from "../world/blocks";
import { GameSession, MAX_EDITS } from "./GameSession";

function sessionWithGround(): GameSession {
  const session = GameSession.create("Test", "two-layers", 1000);
  const ground = session.world.generator.surfaceAt(8);
  for (let x = 4; x <= 14; x++) {
    for (let y = ground - 5; y < ground; y++) {
      session.world.setBlock(x, y, Block.Air);
      if (session.world.getBackgroundOrigin(x, y) === "trunk") session.world.setBackground(x, y, Block.Air);
    }
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
    expect(session.world.getBlock(x, y - 1)).toBe(Block.PineLog);
    expect(session.world.getBackground(x, y - 1)).toBe(Block.Stone);
  });

  describe("mining line of sight", () => {
    function raySession(): GameSession {
      const save = GameSession.create("Rayon", "mining-ray", 1000).snapshot(1000);
      const session = new GameSession({ ...save, generatorVersion: 2 });
      for (let x = -5; x <= 5; x++) {
        for (let y = 5; y <= 15; y++) session.world.setBlock(x, y, Block.Air);
      }
      session.player.x = TILE_SIZE / 2 - PLAYER_WIDTH / 2;
      session.player.y = 10.5 * TILE_SIZE - PLAYER_HEIGHT / 2;
      session.selectHotbar(1);
      return session;
    }

    it.each([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]])(
      "mines the nearest obstacle first along direction (%s, %s)", (dx, dy) => {
        const session = raySession();
        const x = 3 * dx;
        const y = 10 + 3 * dy;
        session.world.setBlock(dx, 10 + dy, Block.Dirt);
        session.world.setBlock(2 * dx, 10 + 2 * dy, Block.Dirt);
        session.world.setBlock(x, y, Block.Stone);
        expect(session.getMiningTarget(x, y)).toEqual({ x: dx, y: 10 + dy, plane: "foreground" });
        expect(session.mine(x, y, 4)).toEqual({ ok: true, destroyed: true });
        expect(session.world.getBlock(dx, 10 + dy)).toBe(Block.Air);
        expect(session.world.getBlock(2 * dx, 10 + 2 * dy)).toBe(Block.Dirt);
        expect(session.getBlockDamage(x, y)).toBe(0);
        expect(session.getMiningTarget(x, y)).toEqual({ x: 2 * dx, y: 10 + 2 * dy, plane: "foreground" });
      },
    );

    it.each(["foreground", "background"] as const)("ignores obstacles on the other plane when mining %s", (plane) => {
      const session = raySession();
      const otherPlane = plane === "foreground" ? "background" : "foreground";
      session.world.setBlockOnPlane(1, 10, Block.Stone, 0, otherPlane);
      session.world.setBlockOnPlane(3, 10, Block.PineLog, 0, plane);
      expect(session.getMiningTarget(3, 10)).toEqual({ x: 3, y: 10, plane });
      expect(session.mine(3, 10, 8)).toEqual({ ok: true, destroyed: true });
      expect(session.world.getBlockOnPlane(1, 10, otherPlane)).toBe(Block.Stone);
      expect(session.world.getBlockOnPlane(3, 10, plane)).toBe(Block.Air);
    });

    it("skips immutable natural backgrounds but mines a nearer constructed background", () => {
      const session = raySession();
      session.world.setBackground(1, 10, Block.Stone);
      session.world.setBackground(2, 10, Block.PineLog);
      session.world.setBackground(3, 10, Block.PineLog);
      const origin = session.world.getBackgroundOrigin.bind(session.world);
      vi.spyOn(session.world, "getBackgroundOrigin").mockImplementation((x, y) =>
        x === 1 && y === 10 ? "natural" : origin(x, y));
      session.hotbar[1] = { itemId: "stonePickaxe", quantity: 1, durability: 100 };
      expect(session.getMiningTarget(3, 10)).toEqual({ x: 2, y: 10, plane: "background" });
      expect(session.mine(3, 10)).toEqual({ ok: true, destroyed: false });
      expect(session.getBlockDamage(1, 10, "background")).toBe(0);
      expect(session.getBlockDamage(2, 10, "background")).toBe(2);
      expect(session.getBlockDamage(3, 10, "background")).toBe(0);
      expect(session.hotbar[1]?.durability).toBe(99);
    });

    it.each([[1, 10], [0, 11]])("does not bypass an obstacle at a diagonal corner (%s, %s)", (x, y) => {
      const session = raySession();
      session.world.setBlock(x, y, Block.Dirt);
      session.world.setBlock(2, 12, Block.Stone);
      expect(session.getMiningTarget(2, 12)).toEqual({ x, y, plane: "foreground" });
      expect(session.mine(2, 12)).toEqual({ ok: true, destroyed: false });
      expect(session.getBlockDamage(x, y)).toBe(1);
      expect(session.getBlockDamage(2, 12)).toBe(0);
    });

    it("uses the actual player centre rather than the centre of its tile", () => {
      const session = raySession();
      session.player.x = 0.1 * TILE_SIZE - PLAYER_WIDTH / 2;
      session.player.y = 10.9 * TILE_SIZE - PLAYER_HEIGHT / 2;
      session.world.setBlock(0, 11, Block.Dirt);
      session.world.setBlock(3, 11, Block.Stone);
      expect(session.getMiningTarget(3, 11)).toEqual({ x: 0, y: 11, plane: "foreground" });
    });

    it("does not mine an obstacle when the aimed cell is outside the mining range", () => {
      const session = raySession();
      session.world.setBlock(1, 10, Block.Dirt);
      const before = session.snapshot(2000);
      expect(session.getMiningTarget(6, 10)).toBeNull();
      expect(session.mine(6, 10)).toMatchObject({ ok: false, reason: expect.stringContaining("portée") });
      expect(session.snapshot(2000)).toEqual(before);
    });
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
    expect(session.world.getBackground(x, y - 1)).toBe(Block.PineLog);
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
    expect(session.world.getBackground(8, y)).toBe(Block.PineLog);
    expect(session.world.getBlock(8, y)).toBe(Block.Air);
  });

  it.each([Block.Dirt, Block.Stone, Block.Clay, Block.Sand, Block.Gravel, Block.Peat])(
    "supports the player and blocks walking through foreground terrain %s", (block) => {
      const session = sessionWithGround();
      const ground = session.world.generator.surfaceAt(8);
      session.world.setBlock(8, ground, block);
      const startY = session.player.y;
      for (let tick = 0; tick < 30; tick++) {
        session.step({ left: false, right: false, up: false, down: false, run: false, jump: false });
      }
      expect(session.player.y).toBe(startY);
      expect(session.player.grounded).toBe(true);
      session.world.setBlock(9, ground - 2, block);
      session.world.setBlock(9, ground - 1, block);
      for (let tick = 0; tick < 25; tick++) {
        session.step({ left: false, right: true, up: false, down: false, run: true, jump: false });
        expect(playerOverlapsSolid(session.world, session.player)).toBe(false);
      }
      expect(session.player.x + PLAYER_WIDTH).toBeLessThanOrEqual(9 * TILE_SIZE);
    },
  );

  it.each([Block.Dirt, Block.Stone, Block.Clay, Block.Sand, Block.Gravel, Block.Peat])(
    "lets the player walk through background terrain %s", (block) => {
      const session = sessionWithGround();
      const ground = session.world.generator.surfaceAt(8);
      session.world.setBackground(9, ground - 2, block);
      session.world.setBackground(9, ground - 1, block);
      for (let tick = 0; tick < 25; tick++) {
        session.step({ left: false, right: true, up: false, down: false, run: false, jump: false });
        expect(playerOverlapsSolid(session.world, session.player)).toBe(false);
      }
      expect(session.player.x).toBeGreaterThan(9 * TILE_SIZE);
    },
  );

  it("ignores an immutable natural background without damage, drops or edits", () => {
    const session = sessionWithGround();
    const x = 10;
    const y = session.world.generator.surfaceAt(x) + 1;
    session.selectHotbar(1);
    session.world.setBlock(x, y, Block.Air);
    expect(session.withinReach(x, y)).toBe(true);
    const before = session.snapshot(2000);
    expect(session.mine(x, y, 100)).toEqual({ ok: false, silent: true });
    expect(session.snapshot(2000)).toEqual(before);
    expect(session.getBlockDamage(x, y, "background")).toBe(0);
    session.selectHotbar(2);
    session.setHotbarPlane(2, "background");
    expect(session.place(x, y)).toMatchObject({ ok: false, reason: expect.stringContaining("occupée") });
  });

  it("prioritizes foreground mining and saves damage independently on both planes", () => {
    const session = sessionWithGround();
    const { x, y } = target(session);
    session.world.setBackground(x, y, Block.PineLog, 90);
    session.selectHotbar(1);
    expect(session.mine(x, y, 2)).toEqual({ ok: true, destroyed: false });
    session.world.setBlock(x, y, Block.Stone);
    // A plane retained by an older save must not override foreground priority.
    session.hotbarPlanes[1] = "background";
    expect(session.mine(x, y)).toEqual({ ok: true, destroyed: false });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.selectedPlane).toBe("background");
    expect(restored.getBlockDamage(x, y, "foreground")).toBe(1);
    expect(restored.getBlockDamage(x, y, "background")).toBe(2);
    expect(restored.world.getBackgroundRotation(x, y)).toBe(90);
    expect(restored.mine(x, y, 11)).toEqual({ ok: true, destroyed: true });
    expect(restored.world.getBlock(x, y)).toBe(Block.Air);
    expect(restored.world.getBackground(x, y)).toBe(Block.PineLog);
    expect(restored.getBlockDamage(x, y, "background")).toBe(2);
    expect(restored.mine(x, y, 6)).toEqual({ ok: true, destroyed: true });
    expect(restored.world.getBackground(x, y)).toBe(Block.Air);
    expect(restored.getBlockDamage(x, y, "foreground")).toBe(0);
    expect(restored.hotbar[2]?.quantity).toBe(25);
    expect(restored.inventory.pine_log).toBe(0);
  });

  it("harvests natural trunks and does not restore them after rebuilding and reloading", () => {
    const session = sessionWithGround();
    let trunk: { x: number; y: number } | null = null;
    for (let x = 14; x <= 300 && !trunk; x++) {
      const y = session.world.generator.surfaceAt(x) - 1;
      if (session.world.getBackgroundOrigin(x, y) === "trunk" &&
          session.world.getBackground(x, y) === Block.PineLog) trunk = { x, y };
    }
    if (!trunk) throw new Error("No generated trunk found.");
    const { x, y } = trunk;
    session.player.x = (x - 2) * TILE_SIZE;
    session.player.y = (y - 1) * TILE_SIZE;
    session.selectHotbar(1);
    session.world.setBlock(x, y, Block.Air);
    for (let cx = x - 2; cx < x; cx++) {
      for (let cy = y - 1; cy <= y; cy++) {
        if (session.world.getBackgroundOrigin(cx, cy) === "trunk") session.world.setBackground(cx, cy, Block.Air);
      }
    }
    expect(session.getMiningTarget(x, y)).toEqual({ x, y, plane: "background" });
    expect(session.mine(x, y, 8)).toEqual({ ok: true, destroyed: true });
    expect(session.hotbar[2]?.quantity).toBe(25);
    expect(session.inventory.pine_log).toBe(0);
    expect(session.world.getBlock(x, y)).toBe(Block.Air);
    expect(session.world.getBackground(x, y)).toBe(Block.Air);
    session.selectHotbar(2);
    session.setHotbarPlane(2, "background");
    session.rotateSelected(1);
    expect(session.place(x, y)).toEqual({ ok: true });
    expect(session.world.getBackgroundOrigin(x, y)).toBe("placed");
    session.selectHotbar(1);
    expect(session.mine(x, y, 8)).toEqual({ ok: true, destroyed: true });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.world.getBackground(x, y)).toBe(Block.Air);
    expect(restored.world.backgroundEdits).toContainEqual({ x, y, block: Block.Air });
    expect(restored.hotbar[2]?.quantity).toBe(25);
    expect(restored.inventory.pine_log).toBe(0);
  });

  it("keeps plan choices on slots and automatically adjusts incompatible incoming stacks", () => {
    const session = sessionWithGround();
    expect(session.toggleHotbarPlane(0)).toEqual({ ok: true });
    expect(session.selectedSlot).toBe(2);
    expect(session.hotbarPlanes[0]).toBe("background");
    expect(session.setHotbarPlane(1, "background")).toMatchObject({ ok: false });
    session.hotbarPlanes[1] = "background";
    session.inventory.ladder = 5;
    expect(session.moveInventoryToHotbar(0, 1)).toEqual({ ok: true });
    expect(session.hotbarPlanes[1]).toBe("foreground");
    expect(session.toggleHotbarPlane(1)).toMatchObject({ ok: false });
    session.hotbarPlanes[8] = "background";
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
    // Keep the ray clear so this assertion tests the edit limit, not a nearer surface block.
    session.player.x = 10 * TILE_SIZE;
    session.player.y = (ground - 2) * TILE_SIZE - PLAYER_HEIGHT;
    for (let row = ground - 4; row < ground; row++) session.world.setBlock(10, row, Block.Air);
    expect(session.getMiningTarget(10, ground)).toEqual({ x: 10, y: ground, plane: "foreground" });
    const before = session.inventory.dirt;
    expect(session.world.wouldAddEdit(10, ground, Block.Air, 0, "foreground")).toBe(true);
    expect(session.mine(10, ground, 4)).toMatchObject({ ok: false, reason: expect.stringContaining("Limite") });
    expect(session.inventory.dirt).toBe(before);
    expect(session.world.getBlock(10, ground)).not.toBe(Block.Air);
  });
});
