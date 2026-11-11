import { BLOCKS, Block, MAX_TILE_X, TILE_SIZE, isStairBlock } from "../world/blocks";
import type { WorldModel } from "../world/WorldModel";

export const PLAYER_WIDTH = 12;
export const PLAYER_HEIGHT = 26;
const STAIR_STEP = TILE_SIZE / 4;
const COLLISION_EPSILON = 0.001;

interface CollisionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  stair: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  climbing: boolean;
}

export interface MovementInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
  up: boolean;
  down: boolean;
}

export function overlapsPlayer(player: PlayerState, x: number, y: number): boolean {
  return player.x < (x + 1) * TILE_SIZE && player.x + PLAYER_WIDTH > x * TILE_SIZE &&
    player.y < (y + 1) * TILE_SIZE && player.y + PLAYER_HEIGHT > y * TILE_SIZE;
}

function collisionRects(world: WorldModel, x: number, y: number): CollisionRect[] {
  const block = world.getBlock(x, y);
  if (!BLOCKS[block].solid) return [];
  const left = x * TILE_SIZE;
  const top = y * TILE_SIZE;
  if (!isStairBlock(block)) {
    return [{ left, right: left + TILE_SIZE, top, bottom: top + TILE_SIZE, stair: false }];
  }
  const rotation = world.getRotation(x, y);
  return Array.from({ length: 4 }, (_, step) => {
    let l = step * STAIR_STEP;
    let r = (step + 1) * STAIR_STEP;
    let t = TILE_SIZE - (step + 1) * STAIR_STEP;
    let b = TILE_SIZE;
    for (let angle = 0; angle < rotation; angle += 90) {
      [l, r, t, b] = [TILE_SIZE - b, TILE_SIZE - t, l, r];
    }
    return {
      left: left + l, right: left + r, top: top + t, bottom: top + b,
      stair: rotation === 0 || rotation === 90,
    };
  });
}

function overlappingSolids(world: WorldModel, player: PlayerState): CollisionRect[] {
  const left = Math.floor(player.x / TILE_SIZE);
  const right = Math.floor((player.x + PLAYER_WIDTH - COLLISION_EPSILON) / TILE_SIZE);
  const top = Math.floor(player.y / TILE_SIZE);
  const bottom = Math.floor((player.y + PLAYER_HEIGHT - COLLISION_EPSILON) / TILE_SIZE);
  const collisions: CollisionRect[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      for (const rect of collisionRects(world, x, y)) {
        if (player.x < rect.right && player.x + PLAYER_WIDTH > rect.left &&
            player.y < rect.bottom && player.y + PLAYER_HEIGHT > rect.top) {
          collisions.push(rect);
        }
      }
    }
  }
  return collisions;
}

export function playerOverlapsSolid(world: WorldModel, player: PlayerState): boolean {
  return overlappingSolids(world, player).length > 0;
}

function supportBelow(world: WorldModel, player: PlayerState, maxDrop: number): CollisionRect[] {
  const feet = player.y + PLAYER_HEIGHT;
  const left = Math.floor(player.x / TILE_SIZE);
  const right = Math.floor((player.x + PLAYER_WIDTH - COLLISION_EPSILON) / TILE_SIZE);
  const top = Math.floor((feet - COLLISION_EPSILON) / TILE_SIZE);
  const bottom = Math.floor((feet + maxDrop) / TILE_SIZE);
  const supports: CollisionRect[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      for (const rect of collisionRects(world, x, y)) {
        if (player.x < rect.right && player.x + PLAYER_WIDTH > rect.left &&
            rect.top >= feet - COLLISION_EPSILON && rect.top <= feet + maxDrop + COLLISION_EPSILON) {
          supports.push(rect);
        }
      }
    }
  }
  return supports;
}

export function stepPlayer(world: WorldModel, player: PlayerState, input: MovementInput): void {
  const dt = 1 / 60;
  const wasGrounded = player.grounded;
  const wasOnStair = wasGrounded && supportBelow(world, player, 0).some((rect) => rect.stair);
  player.vx = (Number(input.right) - Number(input.left)) * (input.run ? 135 : 85);
  if (input.jump && player.grounded) player.vy = -245;
  const verticalInput = input.up || input.down;
  player.climbing = !input.jump && (player.climbing || verticalInput) &&
    isNearLadder(world, player, !verticalInput);
  if (player.climbing) {
    player.vy = (Number(input.down) - Number(input.up)) * 70;
  } else {
    player.vy = Math.min(400, player.vy + 680 * dt);
  }

  player.x += player.vx * dt;
  player.x = Math.max(-MAX_TILE_X * TILE_SIZE, Math.min(MAX_TILE_X * TILE_SIZE - PLAYER_WIDTH, player.x));
  let horizontal = overlappingSolids(world, player);
  if (horizontal.length > 0 && wasGrounded && !player.climbing && player.vy >= 0 &&
      horizontal.every((rect) => rect.stair)) {
    const steppedY = Math.min(...horizontal.map((rect) => rect.top)) - PLAYER_HEIGHT;
    const rise = player.y - steppedY;
    if (rise > 0 && rise <= STAIR_STEP + COLLISION_EPSILON && steppedY >= 0 &&
        !playerOverlapsSolid(world, { ...player, y: steppedY })) {
      player.y = steppedY;
      horizontal = [];
    }
  }
  if (horizontal.length > 0) {
    if (player.vx > 0) player.x = Math.min(player.x, ...horizontal.map((rect) => rect.left - PLAYER_WIDTH));
    if (player.vx < 0) player.x = Math.max(player.x, ...horizontal.map((rect) => rect.right));
    player.vx = 0;
  }
  if (wasGrounded && !player.climbing && player.vy >= 0) {
    const supports = supportBelow(world, player, STAIR_STEP)
      .filter((rect) => rect.stair || wasOnStair)
      .sort((a, b) => a.top - b.top);
    for (const support of supports) {
      const nextY = support.top - PLAYER_HEIGHT;
      if (!playerOverlapsSolid(world, { ...player, y: nextY })) {
        player.y = nextY;
        break;
      }
    }
  }

  player.y = Math.max(0, player.y + player.vy * dt);
  player.grounded = false;
  const vertical = overlappingSolids(world, player);
  if (vertical.length > 0) {
    if (player.vy > 0) {
      player.y = Math.min(player.y, ...vertical.map((rect) => rect.top - PLAYER_HEIGHT));
      player.grounded = true;
    } else if (player.vy < 0) {
      player.y = Math.max(player.y, ...vertical.map((rect) => rect.bottom));
    }
    player.vy = 0;
  }
  if (player.grounded) player.climbing = false;
}

function isNearLadder(world: WorldModel, player: PlayerState, requireOverlap: boolean): boolean {
  const left = Math.floor((player.x - TILE_SIZE) / TILE_SIZE);
  const right = Math.floor((player.x + PLAYER_WIDTH + TILE_SIZE) / TILE_SIZE);
  const top = Math.floor(player.y / TILE_SIZE);
  const bottom = Math.floor((player.y + PLAYER_HEIGHT - 0.001) / TILE_SIZE);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (world.getBlock(x, y) === Block.Ladder && (!requireOverlap || overlapsPlayer(player, x, y))) return true;
    }
  }
  return false;
}
