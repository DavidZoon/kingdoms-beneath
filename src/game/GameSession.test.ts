import { describe, expect, it } from "vitest";
import { PLAYER_HEIGHT } from "../player/PlayerController";
import { parseSave, serializeSave, validateSave } from "../save/schema";
import { Block, BLOCKS, TILE_SIZE } from "../world/blocks";
import { GameSession, MAX_GROUND_DROPS } from "./GameSession";

const idle = { left: false, right: false, jump: false, run: false, up: false, down: false };

function flatSession(): GameSession {
  const session = GameSession.create("Test", "test", 1000);
  const ground = session.world.generator.surfaceAt(8);
  for (let x = 4; x <= 14; x++) {
    for (let y = ground - 5; y < ground; y++) session.world.setBlock(x, y, Block.Air);
    session.world.setBlock(x, ground, Block.Dirt);
  }
  session.player.y = ground * TILE_SIZE - PLAYER_HEIGHT;
  return session;
}

function ladderSession(): GameSession {
  const session = flatSession();
  const ground = session.world.generator.surfaceAt(8);
  for (let y = ground - 4; y < ground; y++) session.world.setBlock(8, y, Block.Ladder);
  return session;
}

describe("first playable session", () => {
  it("spawns above solid ground and preserves a stationary player", () => {
    const session = flatSession();
    const y = session.player.y;
    for (let step = 0; step < 120; step++) session.step(idle);
    expect(session.player.y).toBe(y);
    expect(session.player.grounded).toBe(true);
    expect(session.tick).toBe(120);
    expect(() => validateSave(session.snapshot(2000))).not.toThrow();
  });

  it("walks, jumps, collides with terrain and lands", () => {
    const session = flatSession();
    const { x, y } = session.player;
    for (let step = 0; step < 15; step++) session.step({ ...idle, right: true });
    expect(session.player.x).toBeGreaterThan(x);
    session.step({ ...idle, jump: true });
    expect(session.player.y).toBeLessThan(y);
    for (let step = 0; step < 100; step++) session.step(idle);
    expect(session.player.y).toBe(y);
    expect(session.player.grounded).toBe(true);
  });

  it("mines blocks into an existing shortcut first and rejects unreachable actions", () => {
    const session = flatSession();
    const y = session.world.generator.surfaceAt(8);
    const before = session.totalItems("dirt");
    for (let hit = 0; hit < 3; hit++) {
      expect(session.mine(8, y)).toEqual({ ok: true, destroyed: false });
      expect(session.world.getBlock(8, y)).toBe(Block.Dirt);
      expect(session.totalItems("dirt")).toBe(before);
    }
    expect(session.mine(8, y)).toEqual({ ok: true, destroyed: true });
    expect(session.world.getBlock(8, y)).toBe(Block.Air);
    expect(session.totalItems("dirt")).toBe(before + 1);
    expect(session.hotbar[0]?.quantity).toBe(before + 1);
    expect(session.inventory.dirt).toBe(0);
    const edits = session.world.edits;
    expect(session.mine(1000, y).ok).toBe(false);
    expect(session.place(1000, y).ok).toBe(false);
    expect(session.world.edits).toEqual(edits);
  });

  it("places selected resources atomically and prevents player entombment", () => {
    const session = flatSession();
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(11, y, Block.Stone);
    const count = session.totalItems("wood");
    expect(session.place(8, y).ok).toBe(false);
    expect(session.totalItems("wood")).toBe(count);
    expect(session.place(10, y)).toEqual({ ok: true });
    expect(session.world.getBlock(10, y)).toBe(Block.Wood);
    expect(session.totalItems("wood")).toBe(count - 1);
    expect(session.place(10, y).ok).toBe(false);
    expect(session.totalItems("wood")).toBe(count - 1);
    for (let hit = 0; hit < BLOCKS[Block.Wood].durability!; hit++) {
      expect(session.mine(10, y).ok).toBe(true);
    }
    expect(session.totalItems("wood")).toBe(count);
    session.hotbar[2] = null;
    expect(session.place(10, y).ok).toBe(false);
    expect(session.world.getBlock(10, y)).toBe(Block.Air);
  });

  it("round-trips terrain, inventory, selection, tick and exact player state", () => {
    const session = flatSession();
    session.mine(9, session.world.generator.surfaceAt(8));
    session.selectHotbar(0);
    session.step({ ...idle, jump: true });
    const snapshot = session.snapshot(2000);
    const restored = new GameSession(parseSave(serializeSave(snapshot)));
    expect(restored.snapshot(2000)).toEqual(snapshot);
  });

  it("can resume a valid save made with a future device clock", () => {
    const session = new GameSession(GameSession.create("Test", "test", 5000).snapshot(6000));
    expect(session.snapshot(2000).updatedAt).toBe(6000);
  });

  it("climbs a placed ladder with the keyboard movement input", () => {
    const session = ladderSession();
    const startY = session.player.y;
    for (let step = 0; step < 30; step++) session.step({ ...idle, up: true });
    expect(session.player.y).toBeLessThan(startY);
    expect(session.player.climbing).toBe(true);
  });

  it("stays on a ladder at the same height when stopping after climbing up or down", () => {
    const session = ladderSession();
    for (let step = 0; step < 30; step++) session.step({ ...idle, up: true });
    const ascendingY = session.player.y;
    for (let step = 0; step < 120; step++) session.step(idle);
    expect(session.player.y).toBe(ascendingY);
    expect(session.player.vy).toBe(0);
    expect(session.player.climbing).toBe(true);

    for (let step = 0; step < 10; step++) session.step({ ...idle, down: true });
    expect(session.player.y).toBeGreaterThan(ascendingY);
    const descendingY = session.player.y;
    for (let step = 0; step < 120; step++) session.step(idle);
    expect(session.player.y).toBe(descendingY);
    expect(session.player.vy).toBe(0);
    expect(session.player.climbing).toBe(true);
  });

  it("stays on a ladder after saving and resuming a stationary climb", () => {
    const session = ladderSession();
    for (let step = 0; step < 30; step++) session.step({ ...idle, up: true });
    session.step(idle);
    const resumed = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    const height = resumed.player.y;
    for (let step = 0; step < 120; step++) resumed.step(idle);
    expect(resumed.player.y).toBe(height);
    expect(resumed.player.climbing).toBe(true);
  });

  it.each(["left", "right"] as const)("falls normally after moving %s away from a ladder", (direction) => {
    const session = ladderSession();
    for (let step = 0; step < 30; step++) session.step({ ...idle, up: true });
    const height = session.player.y;
    for (let step = 0; step < 45; step++) session.step({ ...idle, [direction]: true });
    expect(session.player.climbing).toBe(false);
    expect(session.player.y).toBeGreaterThan(height);
  });

  it("does not hover beside a ladder after moving off it", () => {
    const session = ladderSession();
    for (let step = 0; step < 30; step++) session.step({ ...idle, up: true });
    session.step(idle);
    const height = session.player.y;
    for (let step = 0; step < 12; step++) session.step({ ...idle, right: true });
    expect(session.player.x).toBeGreaterThanOrEqual(9 * TILE_SIZE);
    session.step(idle);
    expect(session.player.climbing).toBe(false);
    expect(session.player.y).toBeGreaterThan(height);
  });

  it("falls if the ladder disappears or the player never started climbing", () => {
    const session = ladderSession();
    for (let step = 0; step < 30; step++) session.step({ ...idle, up: true });
    session.step(idle);
    const height = session.player.y;
    const ground = session.world.generator.surfaceAt(8);
    for (let y = ground - 4; y < ground; y++) session.world.setBlock(8, y, Block.Air);
    session.step(idle);
    expect(session.player.climbing).toBe(false);
    expect(session.player.y).toBeGreaterThan(height);

    const falling = ladderSession();
    falling.player.y -= 2 * TILE_SIZE;
    falling.player.grounded = false;
    const startY = falling.player.y;
    falling.step(idle);
    expect(falling.player.climbing).toBe(false);
    expect(falling.player.y).toBeGreaterThan(startY);
  });

  it("drops selected items, persists them, and collects them in range", () => {
    const session = flatSession();
    const before = session.totalItems("wood");
    expect(session.dropSelectedItem()).toEqual({ ok: true });
    expect(session.totalItems("wood")).toBe(before - 1);
    expect(session.groundDrops).toHaveLength(1);
    const save = parseSave(serializeSave(session.snapshot(2000)));
    const resumed = new GameSession(save);
    expect(resumed.groundDrops).toHaveLength(1);
    expect(resumed.totalItems("wood")).toBe(before - 1);
    resumed.player.x = resumed.groundDrops[0].x - 6;
    resumed.step(idle);
    expect(resumed.groundDrops).toHaveLength(0);
    expect(resumed.totalItems("wood")).toBe(before);
  });

  it("mines into a visible ground drop when all 24 inventory stacks are full", () => {
    const session = flatSession();
    session.hotbar[0] = { itemId: "dirt", quantity: 99 };
    session.inventory.dirt = 99 * 23;
    session.inventory.wood = 99;
    session.inventory.ladder = 0;
    session.inventory.torch = 0;
    const ground = session.world.generator.surfaceAt(8);
    for (let hit = 0; hit < 3; hit++) {
      expect(session.mine(9, ground)).toEqual({ ok: true, destroyed: false });
    }
    expect(session.mine(9, ground)).toEqual({ ok: true, destroyed: true });
    expect(session.inventory.dirt).toBe(99 * 23);
    expect(session.groundDrops).toHaveLength(1);
    expect(session.groundDrops[0].itemId).toBe("dirt");
  });

  it("harvests into a shortcut even when inventory is full", () => {
    const session = flatSession();
    session.inventory.dirt = 99 * 24;
    const before = session.hotbar[0]?.quantity ?? 0;
    const ground = session.world.generator.surfaceAt(8);
    expect(session.mine(9, ground, 4)).toEqual({ ok: true, destroyed: true });
    expect(session.hotbar[0]?.quantity).toBe(before + 1);
    expect(session.inventory.dirt).toBe(99 * 24);
    expect(session.groundDrops).toHaveLength(0);
  });

  it("uses the last shortcut space at the ground-drop limit, then rejects mining without loss", () => {
    const session = flatSession();
    session.inventory.dirt = 99 * 24;
    session.hotbar[0] = { itemId: "dirt", quantity: 98 };
    for (let index = 0; index < MAX_GROUND_DROPS; index++) {
      session.groundDrops.push({ id: `drop-${index}`, x: 0, y: 0, itemId: "dirt", quantity: 1 });
    }
    const ground = session.world.generator.surfaceAt(8);
    expect(session.mine(9, ground, 4)).toEqual({ ok: true, destroyed: true });
    expect(session.hotbar[0]?.quantity).toBe(99);
    expect(session.groundDrops).toHaveLength(MAX_GROUND_DROPS);
    expect(session.mine(10, ground, 4)).toMatchObject({ ok: false, reason: expect.stringContaining("pleins") });
    expect(session.world.getBlock(10, ground)).toBe(Block.Dirt);
    expect(session.getBlockDamage(10, ground)).toBe(0);
    expect(session.hotbar[0]?.quantity).toBe(99);
    expect(session.groundDrops).toHaveLength(MAX_GROUND_DROPS);
  });

  it("collects into shortcuts first and leaves only the excess on the ground if storage is full", () => {
    const session = flatSession();
    session.inventory.dirt = 99 * 24;
    session.hotbar[2] = { itemId: "wood", quantity: 98, rotation: 270 };
    session.groundDrops.push({
      id: "pickup", x: session.player.x + 6, y: session.player.y + PLAYER_HEIGHT / 2,
      itemId: "wood", quantity: 4,
    });
    session.step(idle);
    expect(session.hotbar[2]).toEqual({ itemId: "wood", quantity: 99, rotation: 270 });
    expect(session.inventory.wood).toBe(0);
    expect(session.groundDrops[0].quantity).toBe(3);
    session.inventory.dirt -= 99;
    session.step(idle);
    expect(session.inventory.wood).toBe(3);
    expect(session.groundDrops).toHaveLength(0);
  });

  it.each([
    [Block.Dirt, 4], [Block.Grass, 4], [Block.Meadow, 4], [Block.Stone, 12],
    [Block.Wood, 6], [Block.Branch, 3], [Block.Ladder, 3], [Block.Leaves, 1], [Block.Torch, 2],
  ] as const)(
    "uses the material durability for block %s and grants loot only once",
    (block, durability) => {
      const session = flatSession();
      const y = Math.floor(session.player.y / TILE_SIZE);
      session.world.setBlock(10, y, block);
      expect(BLOCKS[block].durability).toBe(durability);
      const inventory = { ...session.inventory };
      for (let hit = 1; hit < durability; hit++) {
        expect(session.mine(10, y)).toEqual({ ok: true, destroyed: false });
        expect(session.getBlockDamage(10, y)).toBe(hit);
        expect(session.inventory).toEqual(inventory);
        expect(session.world.getBlock(10, y)).toBe(block);
      }
      expect(session.mine(10, y)).toEqual({ ok: true, destroyed: true });
      expect(session.getBlockDamage(10, y)).toBe(0);
      expect(session.world.getBlock(10, y)).toBe(Block.Air);
      const after = { ...session.inventory };
      expect(session.mine(10, y).ok).toBe(false);
      expect(session.inventory).toEqual(after);
    },
  );

  it("persists partial damage across chunk eviction, saves and reloads", () => {
    const session = flatSession();
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(10, y, Block.Stone);
    session.world.setBlock(11, y, Block.Stone);
    session.mine(10, y);
    session.mine(10, y);
    session.world.retainChunks(new Set());
    const snapshot = session.snapshot(2000);
    const resumed = new GameSession(parseSave(serializeSave(snapshot)));
    expect(resumed.getBlockDamage(10, y)).toBe(2);
    expect(resumed.mine(10, y, 10)).toEqual({ ok: true, destroyed: true });
    expect(resumed.place(10, y)).toEqual({ ok: true });
    expect(resumed.getBlockDamage(10, y)).toBe(0);
  });

  it("supports stronger future tools without changing the quarter-second cadence", () => {
    const session = flatSession();
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(10, y, Block.Stone);
    expect(session.mine(10, y, 6)).toEqual({ ok: true, destroyed: false });
    expect(session.mine(10, y, 6)).toEqual({ ok: true, destroyed: true });
    expect(session.mine(10, y, NaN).ok).toBe(false);
  });

  it("gates resource grants behind the saved creative option", () => {
    const session = flatSession();
    const before = session.inventory.stone;
    expect(session.grantResources("stone", 99).ok).toBe(false);
    expect(session.inventory.stone).toBe(before);
    session.setCreativeMode(true);
    expect(session.grantResources("stone", 99)).toEqual({ ok: true, added: 99 });
    const resumed = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(resumed.creativeMode).toBe(true);
    expect(resumed.inventory.stone).toBe(before + 99);
    resumed.setCreativeMode(false);
    expect(resumed.grantResources("wood", 1).ok).toBe(false);
  });

  it("reports partial creative grants and rejects full inventory and invalid quantities", () => {
    const session = flatSession();
    session.setCreativeMode(true);
    Object.assign(session.inventory, { dirt: 99 * 23, stone: 98, wood: 0, ladder: 0, torch: 0 });
    expect(session.grantResources("stone", 99)).toEqual({ ok: true, added: 1 });
    expect(session.grantResources("wood", 1).ok).toBe(false);
    for (const quantity of [-1, 0, 0.5, NaN, Infinity, 2377]) {
      expect(session.grantResources("stone", quantity).ok).toBe(false);
    }
    expect(session.inventory.stone).toBe(99);
  });

  it("places and mines a non-solid torch, preserving damage and quality across saves", () => {
    const session = flatSession();
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(11, y, Block.Stone);
    session.selectHotbar(4);
    session.lightingQuality = "reduced";
    expect(session.totalItems("torch")).toBe(4);
    expect(session.place(10, y)).toEqual({ ok: true });
    expect(session.totalItems("torch")).toBe(3);
    expect(session.world.getBlock(10, y)).toBe(Block.Torch);
    expect(BLOCKS[Block.Torch].solid).toBe(false);
    expect(session.mine(10, y)).toEqual({ ok: true, destroyed: false });

    const resumed = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(resumed.selectedItem).toBe("torch");
    expect(resumed.lightingQuality).toBe("reduced");
    expect(resumed.getBlockDamage(10, y)).toBe(1);
    expect(resumed.mine(10, y)).toEqual({ ok: true, destroyed: true });
    expect(resumed.world.getBlock(10, y)).toBe(Block.Air);
    expect(resumed.totalItems("torch")).toBe(4);
  });

  it("supports creative torch grants, ground drops and collection after resuming", () => {
    const session = flatSession();
    session.setCreativeMode(true);
    expect(session.grantResources("torch", 2)).toEqual({ ok: true, added: 2 });
    session.selectHotbar(4);
    expect(session.dropSelectedItem()).toEqual({ ok: true });
    const resumed = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(resumed.groundDrops[0].itemId).toBe("torch");
    expect(resumed.totalItems("torch")).toBe(5);
    resumed.player.x = resumed.groundDrops[0].x - 6;
    resumed.step(idle);
    expect(resumed.groundDrops).toHaveLength(0);
    expect(resumed.totalItems("torch")).toBe(6);
  });

  it.each([
    ["woodStairs", Block.WoodStairs, 6],
    ["stoneStairs", Block.StoneStairs, 12],
  ] as const)("places and recovers %s with its material durability", (itemId, block, durability) => {
    const session = flatSession();
    const y = Math.floor(session.player.y / TILE_SIZE);
    session.world.setBlock(10, y, Block.Air);
    session.world.setBlock(11, y, Block.Stone);
    session.hotbar[8] = { itemId, quantity: 1 };
    session.selectHotbar(8);
    expect(session.place(10, y)).toEqual({ ok: true });
    expect(session.hotbar[8]).toBeNull();
    expect(session.world.getBlock(10, y)).toBe(block);
    for (let hit = 0; hit < durability - 1; hit++) {
      expect(session.mine(10, y)).toEqual({ ok: true, destroyed: false });
    }
    expect(session.mine(10, y)).toEqual({ ok: true, destroyed: true });
    expect(session.inventory[itemId]).toBe(1);
    expect(() => validateSave(session.snapshot(2000))).not.toThrow();
  });

  it("reserves torch materials atomically and reuses a slot freed by the last wood", () => {
    const session = flatSession();
    session.hotbar.fill(null);

    Object.assign(session.inventory, { dirt: 99 * 22, stone: 99, wood: 2, ladder: 0, torch: 0 });
    const full = { ...session.inventory };
    expect(session.startCraft("torch", 2).ok).toBe(false);
    expect(session.inventory).toEqual(full);

    session.inventory.wood = 1;
    expect(session.startCraft("torch", 2)).toEqual({ ok: true });
    expect(session.inventory.wood).toBe(0);
    for (let tick = 0; tick < 120; tick++) session.step(idle);
    expect(session.inventory.torch).toBe(2);
    const noWood = { ...session.inventory };
    expect(session.startCraft("torch", 2).ok).toBe(false);
    expect(session.inventory).toEqual(noWood);

    Object.assign(session.inventory, { dirt: 99 * 22, stone: 0, wood: 2, ladder: 0, torch: 98 });
    const partialSpace = { ...session.inventory };
    expect(session.startCraft("torch", 2).ok).toBe(false);
    expect(session.inventory).toEqual(partialSpace);
  });
});
