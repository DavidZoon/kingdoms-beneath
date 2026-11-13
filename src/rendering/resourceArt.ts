import { RESOURCES, RESOURCE_ITEMS, TILE_ART_SIZE, type BlockId } from "../world/blocks";
import type { ResourceId } from "../world/resources";

// Both atlases hold one 32 × 32 cell per resource, in RESOURCE_ITEMS order.
let tiles: HTMLImageElement | null = null;
let icons: HTMLImageElement | null = null;

const blockIndices = new Map<BlockId, number>();
RESOURCE_ITEMS.forEach((item, index) => {
  const resource = RESOURCES[item];
  if (resource.isBlock) blockIndices.set(resource.block, index);
});

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger ${path}.`));
    image.src = new URL(path, document.baseURI).href;
  });
}

export async function loadResourceArt(): Promise<void> {
  [tiles, icons] = await Promise.all([
    loadImage("assets/resource-tiles.png"),
    loadImage("assets/resource-icons.png"),
  ]);
}

/** Draws the repeatable square texture of a resource block; false when unavailable. */
export function drawResourceTile(ctx: CanvasRenderingContext2D, block: BlockId, x: number): boolean {
  const index = blockIndices.get(block);
  if (!tiles || index === undefined) return false;
  ctx.drawImage(tiles, index * TILE_ART_SIZE, 0, TILE_ART_SIZE, TILE_ART_SIZE, x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
  return true;
}

/** Draws the transparent icon of a resource; false when unavailable. */
export function drawResourceIcon(ctx: CanvasRenderingContext2D, item: ResourceId): boolean {
  const index = RESOURCE_ITEMS.indexOf(item);
  if (!icons || index < 0) return false;
  ctx.drawImage(icons, index * TILE_ART_SIZE, 0, TILE_ART_SIZE, TILE_ART_SIZE, 0, 0, TILE_ART_SIZE, TILE_ART_SIZE);
  return true;
}
