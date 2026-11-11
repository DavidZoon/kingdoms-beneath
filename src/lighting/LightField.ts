import { PLAYER_HEIGHT, PLAYER_WIDTH, type PlayerState } from "../player/PlayerController";
import { BLOCKS, Block, TILE_SIZE, WORLD_HEIGHT, type ItemId } from "../world/blocks";
import type { WorldModel } from "../world/WorldModel";

export const TORCH_RADIUS = 10;
export const CAVE_AMBIENT = 0.12;
const SUNLIGHT_RADIUS = 8;
const LIGHT_EPSILON = 0.000001;

export interface LightBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LightField {
  minX: number;
  minY: number;
  width: number;
  height: number;
  sky: Float32Array;
  torch: Float32Array;
}

export interface LightSource {
  x: number;
  y: number;
  range: number;
}

export function sourceBrightness(distance: number, range: number): number {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(range) || range <= 0) {
    throw new RangeError("Distance ou portée lumineuse invalide.");
  }
  return Math.max(0, Math.min(1, (range - distance) / (range * 0.25)));
}

export function carriedTorchSource(player: PlayerState, selectedItem: ItemId | null): LightSource | null {
  return selectedItem === "torch" ? {
    x: (player.x + PLAYER_WIDTH / 2) / TILE_SIZE,
    y: (player.y + PLAYER_HEIGHT / 2) / TILE_SIZE,
    range: TORCH_RADIUS,
  } : null;
}

function rayTransmission(world: WorldModel, source: LightSource, targetX: number, targetY: number): number {
  let x = Math.floor(source.x);
  let y = Math.floor(source.y);
  const endX = Math.floor(targetX);
  const endY = Math.floor(targetY);
  if (x === endX && y === endY) return 1;
  const dx = targetX - source.x;
  const dy = targetY - source.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
  let nextX = dx === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) - source.x) / dx;
  let nextY = dy === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) - source.y) / dy;
  let transmission = 1 - BLOCKS[world.getBlock(x, y)].opacity;
  if (transmission <= LIGHT_EPSILON) return 0;
  while (x !== endX || y !== endY) {
    if (Math.abs(nextX - nextY) < LIGHT_EPSILON) {
      // Check both sides of an exact corner so light cannot slip between touching walls.
      transmission *= 1 - BLOCKS[world.getBlock(x + stepX, y)].opacity;
      transmission *= 1 - BLOCKS[world.getBlock(x, y + stepY)].opacity;
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else {
      y += stepY;
      nextY += deltaY;
    }
    if (transmission <= LIGHT_EPSILON) return 0;
    if (x === endX && y === endY) break;
    transmission *= 1 - BLOCKS[world.getBlock(x, y)].opacity;
    if (transmission <= LIGHT_EPSILON) return 0;
  }
  return transmission;
}

function illuminate(world: WorldModel, field: LightField, source: LightSource): void {
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y) ||
      !Number.isFinite(source.range) || source.range <= 0) {
    throw new RangeError("Source lumineuse invalide.");
  }
  const minX = Math.max(field.minX, Math.floor(source.x - source.range));
  const maxX = Math.min(field.minX + field.width - 1, Math.floor(source.x + source.range));
  const minY = Math.max(field.minY, Math.floor(source.y - source.range));
  const maxY = Math.min(field.minY + field.height - 1, Math.floor(source.y + source.range));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const brightness = sourceBrightness(Math.hypot(x + 0.5 - source.x, y + 0.5 - source.y), source.range);
      const index = (y - field.minY) * field.width + x - field.minX;
      if (brightness <= field.torch[index]) continue;
      const light = brightness * rayTransmission(world, source, x + 0.5, y + 0.5);
      if (light > field.torch[index]) field.torch[index] = light;
    }
  }
}

export function withLightSources(world: WorldModel, field: LightField, sources: readonly LightSource[]): LightField {
  const combined = { ...field, torch: field.torch.slice() };
  for (const source of sources) illuminate(world, combined, source);
  return combined;
}

function propagate(
  light: Float32Array,
  transmitted: Float32Array,
  opacity: Float32Array,
  queue: number[],
  width: number,
  height: number,
  radius: number,
): void {
  const falloff = 1 / (radius + 1);
  const spread = (index: number, incoming: number): void => {
    // Opaque cells can be lit on their surface without transmitting light.
    if (incoming > light[index]) light[index] = incoming;
    const next = incoming * (1 - opacity[index]);
    if (next > transmitted[index] + LIGHT_EPSILON) {
      transmitted[index] = next;
      queue.push(index);
    }
  };
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const incoming = transmitted[index] - falloff;
    if (incoming <= LIGHT_EPSILON) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) spread(index - 1, incoming);
    if (x + 1 < width) spread(index + 1, incoming);
    if (y > 0) spread(index - width, incoming);
    if (y + 1 < height) spread(index + width, incoming);
  }
}

export function calculateLightField(world: WorldModel, visible: LightBounds): LightField {
  if (!Number.isInteger(visible.minX) || !Number.isInteger(visible.maxX) ||
      !Number.isInteger(visible.minY) || !Number.isInteger(visible.maxY) ||
      visible.minX > visible.maxX ||
      visible.minY > visible.maxY || visible.maxY >= WORLD_HEIGHT) {
    throw new RangeError("Limites de la carte de lumière invalides.");
  }
  const margin = Math.max(TORCH_RADIUS, SUNLIGHT_RADIUS);
  const minX = visible.minX - margin;
  const maxX = visible.maxX + margin;
  const minY = visible.minY - margin;
  const maxY = Math.min(WORLD_HEIGHT - 1, visible.maxY + margin);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const size = width * height;
  const sky = new Float32Array(size);
  const torch = new Float32Array(size);
  const opacity = new Float32Array(size);
  const skyTransmitted = new Float32Array(size);
  const skyQueue: number[] = [];
  const sources: LightSource[] = [];

  for (let x = minX; x <= maxX; x++) {
    let skyTransmission = 1;
    for (let y = Math.min(0, minY); y <= maxY; y++) {
      if (y < minY && skyTransmission === 0) continue;
      const block = world.getBlock(x, y);
      const blockOpacity = BLOCKS[block].opacity;
      if (y >= minY) {
        const index = (y - minY) * width + x - minX;
        sky[index] = skyTransmission;
        opacity[index] = blockOpacity;
        const skyThrough = skyTransmission * (1 - blockOpacity);
        if (skyThrough > LIGHT_EPSILON) {
          skyTransmitted[index] = skyThrough;
          skyQueue.push(index);
        }
        if (block === Block.Torch) {
          sources.push({ x: x + 0.5, y: y + 0.5, range: TORCH_RADIUS });
        }
      }
      skyTransmission *= 1 - blockOpacity;
    }
  }

  propagate(sky, skyTransmitted, opacity, skyQueue, width, height, SUNLIGHT_RADIUS);
  const field = { minX, minY, width, height, sky, torch };
  for (const source of sources) illuminate(world, field, source);
  return field;
}

export function sampleLight(field: LightField, x: number, y: number): { sky: number; torch: number } {
  const localX = x - field.minX;
  const localY = y - field.minY;
  if (!Number.isInteger(localX) || !Number.isInteger(localY) ||
      localX < 0 || localX >= field.width || localY < 0 || localY >= field.height) {
    throw new RangeError("Cellule en dehors de la carte de lumière.");
  }
  const index = localY * field.width + localX;
  return { sky: field.sky[index], torch: field.torch[index] };
}

export function lightBrightness(sky: number, torch: number, daylight: number): number {
  return Math.max(CAVE_AMBIENT, sky * daylight, torch);
}
