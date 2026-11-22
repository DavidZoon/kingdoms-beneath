import { BLOCKS, TILE_SIZE, WORLD_HEIGHT, MAX_TILE_X } from "../world/blocks";
import type { WorldModel } from "../world/WorldModel";
import type { PlayerState } from "../player/PlayerController";
import type { Difficulty } from "../survival/Difficulty";

export const ZOMBIE_WIDTH = 12;
export const ZOMBIE_HEIGHT = 26;
export const ZOMBIE_MAX_HEALTH = 40;
export const ZOMBIE_SPEED = 34;
export const ZOMBIE_ATTACK_RANGE = 18;
export const ZOMBIE_ATTACK_COOLDOWN = 45;
const GRAVITY = 680;
const EPSILON = 0.001;

export interface ZombieState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
  grounded: boolean;
  attackCooldown: number;
}

export interface NightWaveState {
  lastStartedDay: number;
  pending: number;
  nextSpawnTick: number;
}

export interface ZombieStepResult {
  damage: number;
}

export function zombieOverlapsTile(zombie: ZombieState, x: number, y: number): boolean {
  return zombie.x < (x + 1) * TILE_SIZE && zombie.x + ZOMBIE_WIDTH > x * TILE_SIZE &&
    zombie.y < (y + 1) * TILE_SIZE && zombie.y + ZOMBIE_HEIGHT > y * TILE_SIZE;
}

function overlapsSolid(world: WorldModel, x: number, y: number): boolean {
  const left = Math.floor(x / TILE_SIZE);
  const right = Math.floor((x + ZOMBIE_WIDTH - EPSILON) / TILE_SIZE);
  const top = Math.floor(y / TILE_SIZE);
  const bottom = Math.floor((y + ZOMBIE_HEIGHT - EPSILON) / TILE_SIZE);
  for (let cy = Math.max(0, top); cy <= bottom; cy++) {
    for (let cx = left; cx <= right; cx++) {
      if (BLOCKS[world.getBlock(cx, cy)].solid) return true;
    }
  }
  return false;
}

export function zombieOverlapsSolid(world: WorldModel, zombie: Pick<ZombieState, "x" | "y">): boolean {
  return overlapsSolid(world, zombie.x, zombie.y);
}

export function spawnZombie(world: WorldModel, player: PlayerState, direction: -1 | 1, id: string, offset: number): ZombieState | null {
  const playerTile = Math.floor((player.x + 6) / TILE_SIZE);
  const xTile = playerTile + direction * (18 + offset);
  if (Math.abs(xTile) > MAX_TILE_X) return null;
  const surface = world.generator.surfaceAt(xTile);
  const x = xTile * TILE_SIZE + 2;
  const y = surface * TILE_SIZE - ZOMBIE_HEIGHT;
  if (overlapsSolid(world, x, y) || !BLOCKS[world.getBlock(xTile, surface)].solid) return null;
  return {
    id, x, y, vx: 0, vy: 0, health: ZOMBIE_MAX_HEALTH, grounded: true, attackCooldown: 0,
  };
}

function moveZombie(world: WorldModel, zombie: ZombieState): void {
  const dt = 1 / 60;
  const wasGrounded = zombie.grounded;
  zombie.x += zombie.vx * dt;
  zombie.x = Math.max(-MAX_TILE_X * TILE_SIZE, Math.min(MAX_TILE_X * TILE_SIZE - ZOMBIE_WIDTH, zombie.x));
  if (overlapsSolid(world, zombie.x, zombie.y)) {
    if (wasGrounded && !overlapsSolid(world, zombie.x, zombie.y - TILE_SIZE)) {
      zombie.y -= TILE_SIZE;
    } else {
      zombie.x -= zombie.vx * dt;
      zombie.vx = 0;
    }
  }
  zombie.vy = Math.min(400, zombie.vy + GRAVITY * dt);
  const nextY = zombie.y + zombie.vy * dt;
  zombie.grounded = false;
  if (overlapsSolid(world, zombie.x, nextY)) {
    if (zombie.vy > 0) {
      const feet = nextY + ZOMBIE_HEIGHT;
      zombie.y = Math.floor((feet - EPSILON) / TILE_SIZE) * TILE_SIZE - ZOMBIE_HEIGHT;
      zombie.grounded = true;
    } else {
      zombie.y = (Math.floor(nextY / TILE_SIZE) + 1) * TILE_SIZE;
    }
    zombie.vy = 0;
  } else {
    zombie.y = nextY;
  }
  zombie.y = Math.max(0, Math.min((WORLD_HEIGHT - 1) * TILE_SIZE - ZOMBIE_HEIGHT, zombie.y));
}

export function stepZombie(
  world: WorldModel,
  zombie: ZombieState,
  player: PlayerState,
  difficulty: Difficulty,
): ZombieStepResult {
  if (zombie.attackCooldown > 0) zombie.attackCooldown--;
  const playerCenter = player.x + 6;
  const zombieCenter = zombie.x + ZOMBIE_WIDTH / 2;
  const distance = playerCenter - zombieCenter;
  zombie.vx = Math.abs(distance) > ZOMBIE_ATTACK_RANGE ? Math.sign(distance) * ZOMBIE_SPEED : 0;
  moveZombie(world, zombie);
  const close = Math.hypot(
    playerCenter - (zombie.x + ZOMBIE_WIDTH / 2),
    player.y + 13 - (zombie.y + ZOMBIE_HEIGHT / 2),
  ) <= ZOMBIE_ATTACK_RANGE;
  if (close && zombie.attackCooldown === 0) {
    zombie.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
    return { damage: difficulty.zombieDamage };
  }
  return { damage: 0 };
}
