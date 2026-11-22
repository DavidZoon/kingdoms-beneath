import { BLOCKS, isLiquidBlock, TILE_SIZE, WORLD_HEIGHT, MAX_TILE_X } from "../world/blocks";
import type { WorldModel } from "../world/WorldModel";
import type { PlayerState } from "../player/PlayerController";
import type { Difficulty } from "../survival/Difficulty";

export const ZOMBIE_WIDTH = 12;
export const ZOMBIE_HEIGHT = 26;
export const ZOMBIE_MAX_HEALTH = 40;
export const ZOMBIE_SPEED = 34;
export const ZOMBIE_ATTACK_RANGE = 18;
export const ZOMBIE_ATTACK_COOLDOWN = 45;
export const ZOMBIE_DIG_COOLDOWN = 15;
export const ZOMBIE_DETECTION_RANGE = 5 * TILE_SIZE;
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
  stunTicks: number;
  digCooldown: number;
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

function liquidAt(world: WorldModel, x: number, y: number): boolean {
  const left = Math.floor(x / TILE_SIZE);
  const right = Math.floor((x + ZOMBIE_WIDTH - EPSILON) / TILE_SIZE);
  const top = Math.floor(y / TILE_SIZE);
  const bottom = Math.floor((y + ZOMBIE_HEIGHT - EPSILON) / TILE_SIZE);
  for (let cy = top; cy <= bottom; cy++) {
    for (let cx = left; cx <= right; cx++) {
      if (isLiquidBlock(world.getBlock(cx, cy))) return true;
    }
  }
  return false;
}

function overlappingSolidTop(world: WorldModel, x: number, y: number): number | null {
  const left = Math.floor(x / TILE_SIZE);
  const right = Math.floor((x + ZOMBIE_WIDTH - EPSILON) / TILE_SIZE);
  const top = Math.floor(y / TILE_SIZE);
  const bottom = Math.floor((y + ZOMBIE_HEIGHT - EPSILON) / TILE_SIZE);
  let solidTop: number | null = null;
  for (let cy = Math.max(0, top); cy <= bottom; cy++) {
    for (let cx = left; cx <= right; cx++) {
      if (!BLOCKS[world.getBlock(cx, cy)].solid) continue;
      solidTop = Math.min(solidTop ?? Infinity, cy * TILE_SIZE);
    }
  }
  return solidTop;
}

export function zombieOverlapsSolid(world: WorldModel, zombie: Pick<ZombieState, "x" | "y">): boolean {
  return overlapsSolid(world, zombie.x, zombie.y);
}

export function separateZombies(world: WorldModel, zombies: readonly ZombieState[]): void {
  const canMoveTo = (zombie: ZombieState, x: number): boolean =>
    x >= -MAX_TILE_X * TILE_SIZE &&
    x <= MAX_TILE_X * TILE_SIZE - ZOMBIE_WIDTH &&
    !overlapsSolid(world, x, zombie.y);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let first = 0; first < zombies.length; first++) {
      for (let second = first + 1; second < zombies.length; second++) {
        const leftZombie = zombies[first];
        const rightZombie = zombies[second];
        const verticalOverlap = Math.min(leftZombie.y + ZOMBIE_HEIGHT, rightZombie.y + ZOMBIE_HEIGHT) -
          Math.max(leftZombie.y, rightZombie.y);
        if (verticalOverlap <= 0) continue;
        const leftCenter = leftZombie.x + ZOMBIE_WIDTH / 2;
        const rightCenter = rightZombie.x + ZOMBIE_WIDTH / 2;
        const overlap = ZOMBIE_WIDTH - Math.abs(rightCenter - leftCenter);
        if (overlap <= 0) continue;
        const direction = rightCenter === leftCenter
          ? leftZombie.id < rightZombie.id ? 1 : -1
          : Math.sign(rightCenter - leftCenter);
        let leftMoved = 0;
        let rightMoved = 0;
        const half = overlap / 2;
        if (canMoveTo(leftZombie, leftZombie.x - direction * half)) {
          leftMoved = -direction * half;
        }
        if (canMoveTo(rightZombie, rightZombie.x + direction * half)) {
          rightMoved = direction * half;
        }
        if (leftMoved === 0 && rightMoved !== 0) rightMoved = direction * overlap;
        else if (rightMoved === 0 && leftMoved !== 0) leftMoved = -direction * overlap;
        if ((rightMoved !== 0 && !canMoveTo(rightZombie, rightZombie.x + rightMoved)) ||
            (leftMoved !== 0 && !canMoveTo(leftZombie, leftZombie.x + leftMoved))) {
          continue;
        }
        if (leftMoved !== 0 || rightMoved !== 0) {
          leftZombie.x += leftMoved;
          leftZombie.vx = 0;
          rightZombie.x += rightMoved;
          rightZombie.vx = 0;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
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
    stunTicks: 0,
    digCooldown: 0,
  };
}

function moveZombie(world: WorldModel, zombie: ZombieState, targetY = zombie.y + ZOMBIE_HEIGHT / 2): void {
  const dt = 1 / 60;
  const wasGrounded = zombie.grounded;
  const swimming = liquidAt(world, zombie.x, zombie.y);
  zombie.x += zombie.vx * dt;
  zombie.x = Math.max(-MAX_TILE_X * TILE_SIZE, Math.min(MAX_TILE_X * TILE_SIZE - ZOMBIE_WIDTH, zombie.x));
  const obstacleTop = overlappingSolidTop(world, zombie.x, zombie.y);
  if (obstacleTop !== null) {
    const climbedY = obstacleTop - ZOMBIE_HEIGHT;
    const canStep = zombie.y - climbedY <= 2 * TILE_SIZE + EPSILON &&
      zombie.y - climbedY > 0 && !overlapsSolid(world, zombie.x, climbedY);
    if ((wasGrounded || swimming) &&
        canStep) {
      zombie.y = climbedY;
    } else {
      zombie.x -= zombie.vx * dt;
      zombie.vx = 0;
    }
  }
  const centerY = zombie.y + ZOMBIE_HEIGHT / 2;
  zombie.vy = swimming ? Math.sign(targetY - centerY) * 28 : Math.min(400, zombie.vy + GRAVITY * dt);
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
  const stunned = zombie.stunTicks > 0;
  if (stunned) zombie.stunTicks--;
  if (zombie.attackCooldown > 0) zombie.attackCooldown--;
  if (zombie.digCooldown > 0) zombie.digCooldown--;
  const playerCenter = player.x + 6;
  const zombieCenter = zombie.x + ZOMBIE_WIDTH / 2;
  const distance = playerCenter - zombieCenter;
  zombie.vx = Math.abs(distance) > ZOMBIE_ATTACK_RANGE ? Math.sign(distance) * ZOMBIE_SPEED : 0;
  moveZombie(world, zombie, player.y + 13);
  const close = Math.hypot(
    playerCenter - (zombie.x + ZOMBIE_WIDTH / 2),
    player.y + 13 - (zombie.y + ZOMBIE_HEIGHT / 2),
  ) <= ZOMBIE_ATTACK_RANGE;
  if (close && !stunned && zombie.attackCooldown === 0) {
    zombie.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
    return { damage: difficulty.zombieDamage };
  }
  return { damage: 0 };
}

export function zombieMiningTarget(
  world: WorldModel, zombie: ZombieState, player: PlayerState,
): { x: number; y: number } | null {
  const playerCenter = player.x + 6;
  const zombieCenter = zombie.x + ZOMBIE_WIDTH / 2;
  const distance = playerCenter - zombieCenter;
  if (Math.abs(distance) > ZOMBIE_DETECTION_RANGE ||
      Math.abs(player.y + 13 - (zombie.y + ZOMBIE_HEIGHT / 2)) > ZOMBIE_DETECTION_RANGE) return null;
  const direction = Math.sign(distance) || 1;
  const x = direction > 0
    ? Math.floor((zombie.x + ZOMBIE_WIDTH + 1) / TILE_SIZE)
    : Math.floor((zombie.x - 1) / TILE_SIZE);
  const feetRow = Math.floor((zombie.y + ZOMBIE_HEIGHT + EPSILON) / TILE_SIZE);
  let targetY = feetRow - 1;
  while (targetY >= 0 && targetY >= feetRow - 4 && BLOCKS[world.getBlock(x, targetY)].solid) targetY--;
  const wallHeight = feetRow - 1 - targetY;
  if (wallHeight <= 2) return null;
  targetY++;
  const block = world.getBlock(x, targetY);
  const durability = BLOCKS[block].durability;
  return durability === null || block === 0 ? null : { x, y: targetY };
}
