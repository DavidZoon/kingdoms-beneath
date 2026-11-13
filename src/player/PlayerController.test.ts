import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { parseSave, serializeSave } from "../save/schema";
import { Block, TILE_SIZE } from "../world/blocks";
import { WorldModel } from "../world/WorldModel";
import { PLAYER_HEIGHT, PLAYER_WIDTH, playerInLiquid, playerOverlapsSolid, stepPlayer, type PlayerState } from "./PlayerController";

const idle = { left: false, right: false, jump: false, run: false, up: false, down: false };

function swimmingWorld() {
  const world = new WorldModel("swimming", [], 2);
  for (let x = 8; x <= 11; x++) {
    for (let y = 10; y <= 20; y++) world.setBlock(x, y, Block.Water);
  }
  const player: PlayerState = {
    x: 9 * TILE_SIZE, y: 14 * TILE_SIZE, vx: 0, vy: 300, grounded: false, climbing: false,
  };
  return { world, player };
}

describe("swimming in foreground liquids", () => {
  it("stops normal ascent with half the body submerged, even while moving sideways", () => {
    const { world, player } = swimmingWorld();
    for (let tick = 0; tick < 100; tick++) stepPlayer(world, player, { ...idle, up: true });
    expect(player.y).toBe(10 * TILE_SIZE - PLAYER_HEIGHT / 2);
    expect(player.vy).toBe(0);
    for (let tick = 0; tick < 10; tick++) stepPlayer(world, player, { ...idle, right: true, up: true });
    expect(player.y).toBe(10 * TILE_SIZE - PLAYER_HEIGHT / 2);
    expect(playerInLiquid(world, player)).toBe(true);
    expect(player.grounded).toBe(false);
  });

  it.each([false, true])("falls into water rather than floating with only the feet immersed (up: %s)", (up) => {
    const { world, player } = swimmingWorld();
    player.y = 10 * TILE_SIZE - PLAYER_HEIGHT;
    player.vy = 0;
    for (let tick = 0; tick < 30; tick++) stepPlayer(world, player, { ...idle, up });
    expect(player.y + PLAYER_HEIGHT / 2).toBeGreaterThanOrEqual(10 * TILE_SIZE);
    expect(playerInLiquid(world, player)).toBe(true);
    expect(player.grounded).toBe(false);
  });

  it("keeps a single jump impulse moving upward underwater", () => {
    const { world, player } = swimmingWorld();
    const start = player.y;
    stepPlayer(world, player, { ...idle, jump: true, down: true });
    for (let tick = 0; tick < 15; tick++) stepPlayer(world, player, idle);
    expect(player.y).toBeLessThan(start - TILE_SIZE);
    expect(playerInLiquid(world, player)).toBe(true);
  });

  it("jumps fully out of water and falls back to a half-submerged floating position", () => {
    const { world, player } = swimmingWorld();
    player.y = 10 * TILE_SIZE - PLAYER_HEIGHT / 2;
    player.vy = 0;
    stepPlayer(world, player, { ...idle, jump: true });
    for (let tick = 0; tick < 4; tick++) stepPlayer(world, player, idle);
    expect(player.y + PLAYER_HEIGHT).toBeLessThan(10 * TILE_SIZE);
    expect(playerInLiquid(world, player)).toBe(false);
    expect(player.vy).toBeLessThan(0);
    for (let tick = 0; tick < 90; tick++) stepPlayer(world, player, idle);
    expect(playerInLiquid(world, player)).toBe(true);
    expect(player.y + PLAYER_HEIGHT / 2).toBeGreaterThanOrEqual(10 * TILE_SIZE);
    expect(player.vy).toBe(0);
  });

  it("does not jump through a solid ceiling above the water", () => {
    const { world, player } = swimmingWorld();
    world.setBlock(9, 10, Block.Stone);
    player.y = 11 * TILE_SIZE;
    for (let tick = 0; tick < 20; tick++) {
      stepPlayer(world, player, { ...idle, jump: tick === 0, up: true });
      expect(playerOverlapsSolid(world, player)).toBe(false);
    }
    expect(player.y).toBe(11 * TILE_SIZE);
    expect(player.vy).toBe(0);
  });

  it("floats without input and swims vertically without needing ground or a ladder", () => {
    const { world, player } = swimmingWorld();
    const start = player.y;
    stepPlayer(world, player, idle);
    expect(player.y).toBe(start);
    expect(player.vy).toBe(0);
    for (let tick = 0; tick < 20; tick++) stepPlayer(world, player, { ...idle, up: true });
    expect(player.y).toBeLessThan(start - TILE_SIZE);
    for (let tick = 0; tick < 20; tick++) stepPlayer(world, player, { ...idle, down: true });
    expect(player.y).toBeCloseTo(start);
    expect(player.climbing).toBe(false);
    stepPlayer(world, player, { ...idle, jump: true });
    expect(player.y).toBeLessThan(start);
  });

  it("keeps solid walls, floors and ceilings blocking the swimmer", () => {
    const { world, player } = swimmingWorld();
    for (let y = 10; y <= 18; y++) world.setBlock(11, y, Block.Stone);
    for (let x = 8; x <= 10; x++) {
      world.setBlock(x, 10, Block.Stone);
      world.setBlock(x, 19, Block.Dirt);
    }
    for (let tick = 0; tick < 40; tick++) {
      stepPlayer(world, player, { ...idle, right: true });
      expect(playerOverlapsSolid(world, player)).toBe(false);
    }
    expect(player.x + PLAYER_WIDTH).toBeLessThanOrEqual(11 * TILE_SIZE);
    for (let tick = 0; tick < 80; tick++) {
      stepPlayer(world, player, { ...idle, up: true });
      expect(playerOverlapsSolid(world, player)).toBe(false);
    }
    expect(player.y).toBe(11 * TILE_SIZE);
    for (let tick = 0; tick < 120; tick++) {
      stepPlayer(world, player, { ...idle, down: true });
      expect(playerOverlapsSolid(world, player)).toBe(false);
    }
    expect(player.y + PLAYER_HEIGHT).toBe(19 * TILE_SIZE);
  });

  it("resumes gravity after leaving water and ignores liquids in the background", () => {
    const { world, player } = swimmingWorld();
    for (let tick = 0; tick < 40; tick++) stepPlayer(world, player, { ...idle, right: true });
    expect(playerInLiquid(world, player)).toBe(false);
    expect(player.vy).toBeGreaterThan(0);
    const dryWorld = new WorldModel("swimming", [], 2);
    dryWorld.setBackground(9, 14, Block.Water);
    player.x = 9 * TILE_SIZE;
    player.y = 14 * TILE_SIZE;
    player.vy = 0;
    expect(playerInLiquid(dryWorld, player)).toBe(false);
    stepPlayer(dryWorld, player, { ...idle, up: true });
    expect(player.vy).toBeGreaterThan(0);
  });

  it("detects partial immersion and resumes swimming after a save round-trip", () => {
    const { world, player } = swimmingWorld();
    player.y = 10 * TILE_SIZE - PLAYER_HEIGHT + 1;
    expect(playerInLiquid(world, player)).toBe(true);
    player.y = 14 * TILE_SIZE;
    const save = GameSession.create("Nage", "swimming", 1000).snapshot(2000);
    const session = new GameSession({ ...save, generatorVersion: 2, player, edits: world.edits });
    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    const before = restored.player.y;
    restored.step({ ...idle, down: true });
    expect(restored.player.y).toBeGreaterThan(before);
    expect(restored.player.climbing).toBe(false);
  });
});
