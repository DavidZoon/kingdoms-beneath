import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { parseSave, serializeSave } from "../save/schema";
import { Block, TILE_SIZE } from "../world/blocks";
import { CHEST_CAPACITY } from "./Chest";

function chestSession(itemId: "smallChest" | "mediumChest" | "largeChest" = "smallChest") {
  const session = GameSession.create("Coffres", "chest-test", 1000);
  const y = session.world.generator.surfaceAt(8);
  session.world.setBlock(10, y - 1, Block.Air);
  session.hotbar[6] = { itemId, quantity: 1 };
  session.selectHotbar(6);
  expect(session.place(10, y - 1)).toEqual({ ok: true });
  return { session, x: 10, y: y - 1 };
}

describe("persistent chests", () => {
  it("fills generated cave chests with resources, tools or consumables", () => {
    const session = GameSession.create("Coffre naturel", "generated-chest", 1000);
    let chest;
    for (let x = -200; x <= 200 && !chest; x++) {
      for (let y = 40; y < 94 && !chest; y++) {
        if (session.world.generator.caveChestAt(x, y)) chest = session.chestAt(x, y);
      }
    }
    expect(chest).toBeTruthy();
    const loot = chest?.slots.filter(Boolean) ?? [];
    expect(loot.length).toBeGreaterThan(0);
    expect(loot.every((stack) => stack !== null)).toBe(true);
  });

  it.each(["smallChest", "mediumChest", "largeChest"] as const)(
    "creates a traversable %s with its full capacity",
    (itemId) => {
      const { session, x, y } = chestSession(itemId);
      const chest = session.chestAt(x, y);
      expect(chest).toMatchObject({ itemId, x, y });
      expect(chest?.slots).toHaveLength(CHEST_CAPACITY[itemId]);
      expect(session.world.getBlock(x, y)).not.toBe(Block.Air);
    },
  );

  it("moves material and worn tool stacks both ways and round-trips contents", () => {
    const { session, x, y } = chestSession();
    session.inventory.dirt = 5;
    expect(session.movePlayerStackToChest({ area: "inventory", index: 0 }, x, y, 0))
      .toEqual({ ok: true });
    expect(session.inventory.dirt).toBe(0);
    expect(session.chestAt(x, y)?.slots[0]).toEqual({ itemId: "dirt", quantity: 5 });

    session.hotbar[7] = { itemId: "stonePickaxe", quantity: 1, durability: 123 };
    expect(session.movePlayerStackToChest({ area: "hotbar", index: 7 }, x, y, 1))
      .toEqual({ ok: true });
    expect(session.hotbar[7]).toBeNull();
    expect(session.chestAt(x, y)?.slots[1]).toEqual({
      itemId: "stonePickaxe", quantity: 1, durability: 123,
    });

    expect(session.moveChestStackToPlayer(x, y, 0, { area: "inventory", index: 0 }))
      .toEqual({ ok: true });
    expect(session.moveChestStackToPlayer(x, y, 1, { area: "hotbar", index: 7 }))
      .toEqual({ ok: true });
    expect(session.inventory.dirt).toBe(5);
    expect(session.hotbar[7]).toEqual({ itemId: "stonePickaxe", quantity: 1, durability: 123 });

    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    expect(restored.chestAt(x, y)?.slots).toHaveLength(CHEST_CAPACITY.smallChest);
    expect(restored.chestAt(x, y)?.slots[0]).toBeNull();
  });

  it("drops the chest contents safely when the chest is mined", () => {
    const { session, x, y } = chestSession();
    const chest = session.chestAt(x, y);
    if (!chest) throw new Error("Coffre introuvable.");
    chest.slots[0] = { itemId: "copper_ingot", quantity: 3 };
    chest.slots[1] = { itemId: "ironPickaxe", quantity: 1, durability: 321 };
    expect(session.mine(x, y, 100)).toEqual({ ok: true, destroyed: true });
    expect(session.chestAt(x, y)).toBeNull();
    expect(session.groundDrops).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: "copper_ingot", quantity: 3 }),
      expect.objectContaining({ itemId: "ironPickaxe", durability: 321 }),
    ]));
  });

  it("keeps a dropped chest traversable and supplies a nearby storage action", () => {
    const { session, x, y } = chestSession("mediumChest");
    expect(session.nearbyChest()).toMatchObject({ x, y, itemId: "mediumChest" });
    session.player.x = x * TILE_SIZE - 8;
    session.player.y = y * TILE_SIZE - 10;
    expect(session.nearbyChest()?.itemId).toBe("mediumChest");
  });
});
