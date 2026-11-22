import { describe, expect, it } from "vitest";
import { GameSession } from "../game/GameSession";
import { DAY_LENGTH_TICKS } from "../lighting/WorldClock";
import { MAX_GROUND_DROPS } from "../game/GameSession";
import { parseSave, serializeSave } from "../save/schema";
import { RESPAWN_TICKS, PLAYER_MAX_HEALTH } from "./SurvivalState";
import { TILE_SIZE } from "../world/blocks";
import type { ZombieState } from "../entities/Zombie";

const idle = { left: false, right: false, jump: false, run: false, up: false, down: false };

function advance(session: GameSession, ticks: number): void {
  for (let index = 0; index < ticks; index++) session.step(idle);
}

function zombie(id: string, x: number, y: number): ZombieState {
  return { id, x, y, vx: 0, vy: 0, health: 40, grounded: true, attackCooldown: 0 };
}

describe("player survival", () => {
  it("enables a threat-free creative difficulty and removes an active horde", () => {
    const session = GameSession.create("Créatif", "creative", 1000);
    session.zombies.push(zombie("zombie-before-creative", session.player.x + 40, session.player.y));
    session.nightWave.pending = 5;
    expect(session.setDifficulty("creative")).toEqual({ ok: true });
    expect(session.creativeMode).toBe(true);
    expect(session.zombies).toEqual([]);
    expect(session.nightWave.pending).toBe(0);
    expect(session.takeDamage(PLAYER_MAX_HEALTH)).toBe(false);
    session.tick = Math.ceil(DAY_LENGTH_TICKS / 3) + 1;
    advance(session, 600);
    expect(session.zombies).toEqual([]);
    expect(session.survival.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("applies one hit cooldown and persists an unfinished respawn", () => {
    const session = GameSession.create("Survie", "survival", 1000);
    expect(session.takeDamage(20)).toBe(true);
    expect(session.survival.health).toBe(80);
    expect(session.takeDamage(20)).toBe(false);
    session.survival.invulnerabilityTicks = 0;
    expect(session.takeDamage(80)).toBe(true);
    expect(session.survival).toMatchObject({ health: 0, dead: true, respawnTicks: RESPAWN_TICKS });

    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    advance(restored, RESPAWN_TICKS - 1);
    expect(restored.survival.dead).toBe(true);
    advance(restored, 1);
    expect(restored.survival).toMatchObject({
      health: PLAYER_MAX_HEALTH, dead: false, respawnTicks: 0,
    });
  });

  it.each([
    ["exploration", 0, 4],
    ["standard", 1, 3],
    ["perilous", 4, 0],
  ] as const)("applies %s death loss without losing tool durability", (difficulty, expectedLost, expectedKept) => {
    const session = GameSession.create("Perte", difficulty, 1000);
    session.setDifficulty(difficulty);
    session.hotbar.fill(null);
    session.inventory.dirt = 4;
    session.inventory.tools.push({ itemId: "stonePickaxe", quantity: 1, durability: 137 });
    session.takeDamage(PLAYER_MAX_HEALTH);

    expect(session.inventory.dirt).toBe(expectedKept);
    const dirtDrops = session.groundDrops.filter((drop) => drop.itemId === "dirt");
    expect(dirtDrops.reduce((total, drop) => total + drop.quantity, 0)).toBe(expectedLost);
    const toolLost = difficulty === "exploration";
    expect(session.inventory.tools.length).toBe(toolLost ? 1 : 0);
    const toolDrop = session.groundDrops.find((drop) => drop.itemId === "stonePickaxe");
    if (toolLost) expect(toolDrop).toBeUndefined();
    else expect(toolDrop).toMatchObject({ quantity: 1, durability: 137 });
    expect(session.groundDrops.length).toBeLessThanOrEqual(MAX_GROUND_DROPS);
  });

  it("finds a safe nearby location when the original respawn is blocked", () => {
    const session = GameSession.create("Respawn", "respawn", 1000);
    session.world.setBlock(
      Math.floor(session.survival.spawnPoint.x / TILE_SIZE),
      Math.floor(session.survival.spawnPoint.y / TILE_SIZE),
      2,
      0,
      true,
    );
    session.takeDamage(PLAYER_MAX_HEALTH);
    advance(session, RESPAWN_TICKS);
    expect(session.survival.dead).toBe(false);
    expect(session.player.x).toBe(session.survival.spawnPoint.x);
    expect(session.player.y).toBeLessThan(session.survival.spawnPoint.y);
  });

  it("preserves carried items when the ground-drop limit cannot accept the death penalty", () => {
    const session = GameSession.create("Storage", "storage", 1000);
    session.hotbar.fill(null);
    session.inventory.dirt = 4;
    session.groundDrops.push(...Array.from({ length: MAX_GROUND_DROPS }, (_, index) => ({
      id: `drop-${index}`, x: 0, y: 0, itemId: "stone" as const, quantity: 1,
    })));
    session.setDifficulty("perilous");
    session.takeDamage(PLAYER_MAX_HEALTH);
    expect(session.inventory.dirt).toBe(4);
    expect(session.groundDrops).toHaveLength(MAX_GROUND_DROPS);
  });
});

describe("first night and combat", () => {
  it("starts one bounded wave per night and does not duplicate it after reload", () => {
    const session = GameSession.create("Nuit", "night", 1000);
    session.setDifficulty("standard");
    session.tick = Math.ceil(DAY_LENGTH_TICKS / 3) + 1;
    session.step(idle);
    expect(session.zombies).toHaveLength(1);
    expect(session.nightWave.pending).toBe(5);
    const day = Math.floor(session.tick / DAY_LENGTH_TICKS);
    expect(session.nightWave.lastStartedDay).toBe(day);

    const restored = new GameSession(parseSave(serializeSave(session.snapshot(2000))));
    advance(restored, 2);
    expect(restored.zombies).toHaveLength(1);
    expect(restored.nightWave.lastStartedDay).toBe(day);
    expect(restored.nightWave.pending).toBe(5);
  });

  it("finishes the configured wave without exceeding the active cap", () => {
    const session = GameSession.create("Nuit plafonnée", "night-cap", 1000);
    session.setDifficulty("exploration");
    session.tick = Math.ceil(DAY_LENGTH_TICKS / 3) + 1;
    session.survival.invulnerabilityTicks = 1800;
    advance(session, 3 * 240 + 20);
    expect(session.zombies).toHaveLength(3);
    expect(session.nightWave.pending).toBe(0);
    advance(session, 500);
    expect(session.zombies).toHaveLength(3);
  });

  it("lets a nearby pickaxe damage and kill a zombie with tool wear", () => {
    const session = GameSession.create("Combat", "combat", 1000);
    session.hotbar[0] = { itemId: "stonePickaxe", quantity: 1, durability: 50 };
    session.selectedSlot = 0;
    const enemy = zombie("zombie-1", session.player.x + TILE_SIZE, session.player.y);
    session.zombies.push(enemy);
    const x = Math.floor((enemy.x + 6) / TILE_SIZE);
    const y = Math.floor((enemy.y + 13) / TILE_SIZE);

    expect(session.attackZombie(x, y)).toEqual({ ok: true, killed: false });
    expect(enemy.health).toBe(38);
    expect(session.hotbar[0]).toMatchObject({ durability: 49 });
    enemy.health = 2;
    expect(session.attackZombie(x, y)).toEqual({ ok: true, killed: true });
    expect(session.zombies).toHaveLength(0);
    expect(session.hotbar[0]).toMatchObject({ durability: 48 });
  });
});
