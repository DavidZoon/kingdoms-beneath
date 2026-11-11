import { Block, MAX_TILE_X, WORLD_HEIGHT, type BlockId } from "../world/blocks";

export type GeneratorVersion = 1 | 2 | 3;

export class WorldGenerator {
  private readonly seedHash: number;

  constructor(seed: string, readonly version: GeneratorVersion = 2) {
    let hash = 2166136261;
    for (const character of seed) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    this.seedHash = hash;
  }

  private noise(index: number, salt: number): number {
    let hash = Math.imul(index ^ this.seedHash ^ salt, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
  }

  private smoothNoise(x: number, scale: number, salt: number): number {
    const index = Math.floor(x / scale);
    const fraction = x / scale - index;
    const blend = fraction * fraction * (3 - 2 * fraction);
    return this.noise(index, salt) * (1 - blend) + this.noise(index + 1, salt) * blend;
  }

  private noise2D(x: number, y: number, salt: number): number {
    let hash = Math.imul(x ^ this.seedHash ^ salt, 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash ^= Math.imul(y ^ salt ^ 0x27d4eb2d, 0x165667b1);
    hash = Math.imul(hash ^ (hash >>> 13), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
  }

  private caveNoise(x: number, y: number): number {
    const scaleX = 7;
    const scaleY = 5;
    const gridX = Math.floor(x / scaleX);
    const gridY = Math.floor(y / scaleY);
    const fractionX = x / scaleX - gridX;
    const fractionY = y / scaleY - gridY;
    const blendX = fractionX * fractionX * (3 - 2 * fractionX);
    const blendY = fractionY * fractionY * (3 - 2 * fractionY);
    const top = this.noise2D(gridX, gridY, 131) * (1 - blendX) +
      this.noise2D(gridX + 1, gridY, 131) * blendX;
    const bottom = this.noise2D(gridX, gridY + 1, 131) * (1 - blendX) +
      this.noise2D(gridX + 1, gridY + 1, 131) * blendX;
    return top * (1 - blendY) + bottom * blendY;
  }

  surfaceAt(x: number): number {
    return Math.round(28 + this.smoothNoise(x, 32, 13) * 6 + this.smoothNoise(x, 96, 27) * 7);
  }

  biomeAt(x: number): "forest" | "plain" {
    return this.smoothNoise(x, 180, 51) > 0.47 ? "forest" : "plain";
  }

  private originalBlockAt(x: number, y: number): BlockId {
    if (y < 0) return Block.Air;
    if (y >= WORLD_HEIGHT - 1) return Block.Bedrock;
    const surface = this.surfaceAt(x);
    if (y === surface) {
      return this.version >= 2 && this.biomeAt(x) === "plain" ? Block.Meadow : Block.Grass;
    }
    if (this.version >= 2 && y >= surface + 8 && y < WORLD_HEIGHT - 4 &&
        this.caveNoise(x, y) > 0.62) return Block.Air;
    if (y > surface) return y <= surface + 4 ? Block.Dirt : Block.Stone;

    for (let region = Math.floor(x / 12) - 1; region <= Math.floor(x / 12) + 1; region++) {
      const anchor = region * 12 + 3 + Math.floor(this.noise(region, 79) * 6);
      if ((anchor >= 3 && anchor <= 13) || this.biomeAt(anchor) !== "forest") continue;
      const top = this.surfaceAt(anchor) - 5 - Math.floor(this.noise(region, 83) * 2);
      if (x === anchor && y >= top && y < this.surfaceAt(anchor)) return Block.Wood;
      if (Math.abs(x - anchor) <= 2 && y >= top - 1 && y <= top + 1) {
        return this.version >= 2 && Math.abs(x - anchor) === 2 ? Block.Branch : Block.Leaves;
      }
    }
    return Block.Air;
  }

  blockAt(x: number, y: number): BlockId {
    const block = this.originalBlockAt(x, y);
    return this.version === 3 && block === Block.Wood ? Block.Air : block;
  }

  isBackgroundTrunk(x: number, y: number): boolean {
    return this.version === 3 && y >= 0 && y < this.surfaceAt(x) &&
      this.originalBlockAt(x, y) === Block.Wood;
  }

  isImmutableBackground(x: number, y: number): boolean {
    return this.version === 3 && Math.abs(x) <= MAX_TILE_X &&
      y > this.surfaceAt(x) && y < WORLD_HEIGHT;
  }

  backgroundAt(x: number, y: number): BlockId {
    if (this.version !== 3 || Math.abs(x) > MAX_TILE_X || y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    const surface = this.surfaceAt(x);
    if (y < surface) return this.isBackgroundTrunk(x, y) ? Block.Wood : Block.Air;
    if (y === surface) return Block.Air;
    const block = this.blockAt(x, y);
    return block === Block.Air ? this.nearestGeneratedBlock(x, y, surface) : block;
  }

  private nearestGeneratedBlock(x: number, y: number, surface: number): BlockId {
    const above = surface + 7;
    const below = WORLD_HEIGHT - 4;
    let bestY = y - above <= below - y ? above : below;
    let bestX = x;
    let bestDistance = (bestY - y) ** 2;
    let bestBlock = this.blockAt(bestX, bestY);
    if (bestBlock === Block.Air) throw new Error("Impossible de déterminer le fond naturel de la grotte.");
    const radius = Math.sqrt(bestDistance);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = dx * dx + dy * dy;
        const candidateX = x + dx;
        const candidateY = y + dy;
        if (distance > bestDistance || Math.abs(candidateX) > MAX_TILE_X ||
            candidateY < 0 || candidateY >= WORLD_HEIGHT) continue;
        const candidate = this.blockAt(candidateX, candidateY);
        if (candidate === Block.Air) continue;
        if (distance < bestDistance ||
            (distance === bestDistance && (candidateY < bestY ||
              (candidateY === bestY && candidateX < bestX)))) {
          bestBlock = candidate;
          bestDistance = distance;
          bestX = candidateX;
          bestY = candidateY;
        }
      }
    }
    return bestBlock;
  }
}
