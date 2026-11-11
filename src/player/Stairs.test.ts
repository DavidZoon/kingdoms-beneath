import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { validateSave } from "../save/schema";
import { Block, TILE_SIZE, type Rotation } from "../world/blocks";
import { WorldModel } from "../world/WorldModel";
import { PLAYER_HEIGHT, playerOverlapsSolid, stepPlayer, type PlayerState } from "./PlayerController";

const idle = { left: false, right: false, jump: false, run: false, up: false, down: false };
const ground = 60;

function staircase(block: typeof Block.WoodStairs | typeof Block.StoneStairs): WorldModel {
  const world = new WorldModel("stairs");
  for (let x = 0; x <= 12; x++) {
    for (let y = ground - 5; y <= ground; y++) world.setBlock(x, y, Block.Air);
    world.setBlock(x, ground, Block.Dirt);
    if (x >= 5) world.setBlock(x, ground - 1, Block.Dirt);
  }
  world.setBlock(4, ground - 1, block);
  return world;
}

function player(x: number, y: number): PlayerState {
  return { x, y, vx: 0, vy: 0, grounded: true, climbing: false };
}

describe.each([Block.WoodStairs, Block.StoneStairs])("stair block %s", (block) => {
  it("can be climbed and descended without jumping or entering solid geometry", () => {
    const world = staircase(block);
    const actor = player(3 * TILE_SIZE, ground * TILE_SIZE - PLAYER_HEIGHT);
    for (let tick = 0; tick < 45; tick++) {
      stepPlayer(world, actor, { ...idle, right: true });
      expect(playerOverlapsSolid(world, actor)).toBe(false);
    }
    expect(actor.x).toBeGreaterThan(5 * TILE_SIZE);
    expect(actor.y).toBe((ground - 1) * TILE_SIZE - PLAYER_HEIGHT);
    expect(actor.grounded).toBe(true);

    for (let tick = 0; tick < 45; tick++) {
      stepPlayer(world, actor, { ...idle, left: true });
      expect(playerOverlapsSolid(world, actor)).toBe(false);
    }
    expect(actor.x).toBeLessThan(4 * TILE_SIZE);
    expect(actor.y).toBe(ground * TILE_SIZE - PLAYER_HEIGHT);
    expect(actor.grounded).toBe(true);
  });

  it("cannot lift the player through a low ceiling", () => {
    const world = staircase(block);
    world.setBlock(4, ground - 3, Block.Stone);
    const actor = player(3 * TILE_SIZE, ground * TILE_SIZE - PLAYER_HEIGHT);
    for (let tick = 0; tick < 40; tick++) {
      stepPlayer(world, actor, { ...idle, right: true });
      expect(playerOverlapsSolid(world, actor)).toBe(false);
    }
    expect(actor.x + 12).toBeLessThanOrEqual(4 * TILE_SIZE + 4);
    expect(actor.y).toBe(ground * TILE_SIZE - PLAYER_HEIGHT - 4);
  });

  it("allows a save above the actual steps but rejects a player inside them", () => {
    const session = GameSession.create("Test", "stairs", 1000);
    const x = 10;
    const y = Math.floor(session.player.y / TILE_SIZE) + 1;
    session.world.setBlock(x, y, block);
    session.player.x = x * TILE_SIZE;
    session.player.y = y * TILE_SIZE + 4 - PLAYER_HEIGHT;
    expect(() => validateSave(session.snapshot(2000))).not.toThrow();
    session.player.y += 1;
    expect(() => validateSave(session.snapshot(2000))).toThrow(/bloqué/);
  });

  it.each([
    [0, [false, true, true, true]],
    [90, [true, false, true, true]],
    [180, [true, true, true, false]],
    [270, [true, true, false, true]],
  ] as const)("rotates the collision geometry by %s degrees", (rotation: Rotation, corners) => {
    const world = new WorldModel("stairs");
    for (let x = 2; x <= 6; x++) {
      for (let y = ground - 3; y <= ground + 3; y++) world.setBlock(x, y, Block.Air);
    }
    world.setBlock(4, ground, block, rotation);
    const hits = [
      player(4 * TILE_SIZE - 8, ground * TILE_SIZE + 1 - PLAYER_HEIGHT),
      player(4 * TILE_SIZE + 12, ground * TILE_SIZE + 1 - PLAYER_HEIGHT),
      player(4 * TILE_SIZE - 8, ground * TILE_SIZE + 15),
      player(4 * TILE_SIZE + 12, ground * TILE_SIZE + 15),
    ].map((actor) => playerOverlapsSolid(world, actor));
    expect(hits).toEqual(corners);
  });
});
