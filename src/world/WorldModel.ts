import { WorldGenerator, type GeneratorVersion } from "../generation/WorldGenerator";
import {
  Block, CHUNK_SIZE, MAX_TILE_X, WORLD_HEIGHT, isRotation,
  type BlockId, type ConstructionPlane, type Rotation,
} from "./blocks";

export interface TileEdit {
  x: number;
  y: number;
  block: BlockId;
  rotation?: Rotation;
}

export type BackgroundOrigin = "empty" | "natural" | "trunk" | "placed";

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function chunkOf(value: number): number {
  return Math.floor(value / CHUNK_SIZE);
}

export class WorldModel {
  readonly generator: WorldGenerator;
  private readonly overrides = new Map<string, TileEdit>();
  private readonly backgroundOverrides = new Map<string, TileEdit>();
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly backgroundChunks = new Map<string, Uint8Array>();
  private version = 0;
  private foregroundVersion = 0;

  constructor(
    seed: string, edits: readonly TileEdit[] = [], generatorVersion: GeneratorVersion = 2,
    backgroundEdits: readonly TileEdit[] = [],
  ) {
    this.generator = new WorldGenerator(seed, generatorVersion);
    for (const edit of edits) this.overrides.set(cellKey(edit.x, edit.y), { ...edit });
    for (const edit of backgroundEdits) this.backgroundOverrides.set(cellKey(edit.x, edit.y), { ...edit });
  }

  getBlock(x: number, y: number): BlockId {
    return this.overrides.get(cellKey(x, y))?.block ?? this.generator.blockAt(x, y);
  }

  getRotation(x: number, y: number): Rotation {
    return this.overrides.get(cellKey(x, y))?.rotation ?? 0;
  }

  getBackground(x: number, y: number): BlockId {
    const edit = this.backgroundOverrides.get(cellKey(x, y));
    if (edit) return edit.block;
    const cx = chunkOf(x);
    const cy = chunkOf(y);
    const cached = this.backgroundChunks.get(cellKey(cx, cy));
    return cached?.[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE] as BlockId | undefined ??
      this.generator.backgroundAt(x, y);
  }

  getBackgroundRotation(x: number, y: number): Rotation {
    return this.backgroundOverrides.get(cellKey(x, y))?.rotation ?? 0;
  }

  getBackgroundOrigin(x: number, y: number): BackgroundOrigin {
    const edit = this.backgroundOverrides.get(cellKey(x, y));
    if (edit) return edit.block === Block.Air ? "empty" : "placed";
    if (this.getBackground(x, y) === Block.Air) return "empty";
    return this.generator.isBackgroundTrunk(x, y) ? "trunk" : "natural";
  }

  getBlockOnPlane(x: number, y: number, plane: ConstructionPlane): BlockId {
    return plane === "foreground" ? this.getBlock(x, y) : this.getBackground(x, y);
  }

  getRotationOnPlane(x: number, y: number, plane: ConstructionPlane): Rotation {
    return plane === "foreground" ? this.getRotation(x, y) : this.getBackgroundRotation(x, y);
  }

  setBlock(x: number, y: number, block: BlockId, rotation: Rotation = 0): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > MAX_TILE_X ||
        y < 0 || y >= WORLD_HEIGHT - 1 || block === Block.Bedrock || !isRotation(rotation) ||
        (block === Block.Air && rotation !== 0)) {
      throw new Error("Modification de cellule hors des limites du monde.");
    }
    const changed = this.getBlock(x, y) !== block || this.getRotation(x, y) !== rotation;
    const key = cellKey(x, y);
    if (block === this.generator.blockAt(x, y) && rotation === 0) {
      this.overrides.delete(key);
    } else {
      this.overrides.set(key, { x, y, block, ...(rotation !== 0 ? { rotation } : {}) });
    }
    const cx = chunkOf(x);
    const cy = chunkOf(y);
    const cached = this.chunks.get(cellKey(cx, cy));
    if (cached) cached[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE] = block;
    if (changed) {
      this.version++;
      this.foregroundVersion++;
    }
  }

  setBackground(x: number, y: number, block: BlockId, rotation: Rotation = 0): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > MAX_TILE_X ||
        y < 0 || y >= WORLD_HEIGHT - 1 || block === Block.Bedrock || !isRotation(rotation) ||
        (block === Block.Air && rotation !== 0)) {
      throw new Error("Modification de cellule hors des limites du monde.");
    }
    const trunk = this.generator.isBackgroundTrunk(x, y);
    if (this.generator.isImmutableBackground(x, y)) {
      throw new Error("Le fond naturel de cette cellule ne peut pas être modifié.");
    }
    const previousBlock = this.getBackground(x, y);
    const previousRotation = this.getBackgroundRotation(x, y);
    const previousOrigin = this.getBackgroundOrigin(x, y);
    const key = cellKey(x, y);
    if (block === Block.Air && !trunk) {
      this.backgroundOverrides.delete(key);
    } else {
      this.backgroundOverrides.set(key, { x, y, block, ...(rotation !== 0 ? { rotation } : {}) });
    }
    const cx = chunkOf(x);
    const cy = chunkOf(y);
    const cached = this.backgroundChunks.get(cellKey(cx, cy));
    if (cached) cached[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE] = block;
    if (previousBlock !== block || previousRotation !== rotation ||
        previousOrigin !== this.getBackgroundOrigin(x, y)) this.version++;
  }

  setBlockOnPlane(x: number, y: number, block: BlockId, rotation: Rotation, plane: ConstructionPlane): void {
    if (plane === "foreground") this.setBlock(x, y, block, rotation);
    else this.setBackground(x, y, block, rotation);
  }

  wouldAddEdit(x: number, y: number, block: BlockId, rotation: Rotation, plane: ConstructionPlane): boolean {
    const key = cellKey(x, y);
    if (plane === "foreground") {
      return !this.overrides.has(key) && (block !== this.generator.blockAt(x, y) || rotation !== 0);
    }
    return !this.backgroundOverrides.has(key) &&
      (block !== Block.Air || this.generator.isBackgroundTrunk(x, y));
  }

  get revision(): number {
    return this.version;
  }

  get foregroundRevision(): number {
    return this.foregroundVersion;
  }

  getChunk(cx: number, cy: number): Uint8Array {
    const key = cellKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          chunk[y * CHUNK_SIZE + x] = this.getBlock(cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y);
        }
      }
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  getBackgroundChunk(cx: number, cy: number): Uint8Array {
    const key = cellKey(cx, cy);
    let chunk = this.backgroundChunks.get(key);
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          chunk[y * CHUNK_SIZE + x] = this.getBackground(cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y);
        }
      }
      this.backgroundChunks.set(key, chunk);
    }
    return chunk;
  }

  retainChunks(keys: ReadonlySet<string>): void {
    for (const key of this.chunks.keys()) if (!keys.has(key)) this.chunks.delete(key);
    for (const key of this.backgroundChunks.keys()) if (!keys.has(key)) this.backgroundChunks.delete(key);
  }

  get cachedChunkCount(): number {
    return this.chunks.size;
  }

  get editCount(): number {
    return this.overrides.size + this.backgroundOverrides.size;
  }

  get edits(): TileEdit[] {
    return [...this.overrides.values()]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((edit) => ({ ...edit }));
  }

  get backgroundEdits(): TileEdit[] {
    return [...this.backgroundOverrides.values()]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((edit) => ({ ...edit }));
  }
}
