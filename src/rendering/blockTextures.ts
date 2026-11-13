import { Block, BLOCKS, ITEM_BLOCKS, RESOURCES, TILE_ART_SIZE, isBlockItem, type BlockId, type MaterialItemId } from "../world/blocks";
import { drawResourceIcon, drawResourceTile } from "./resourceArt";

export function drawBlockTexture(ctx: CanvasRenderingContext2D, block: BlockId, x = 0): void {
  ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
  if (block === Block.Air) return;
  if (drawResourceTile(ctx, block, x)) return;
  const definition = BLOCKS[block];
  ctx.fillStyle = definition.color;
  ctx.fillRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
  if (block === Block.Grass || block === Block.Meadow) {
    ctx.fillStyle = block === Block.Grass ? "#a4c46a" : "#c2cf79";
    ctx.fillRect(x, 0, TILE_ART_SIZE, 6);
    ctx.fillStyle = "#70934d";
    for (let i = 0; i < 6; i++) ctx.fillRect(x + i * 6 + 2, 5, 2, 3);
    ctx.fillStyle = "#5b4938";
    ctx.fillRect(x, 7, TILE_ART_SIZE, 2);
  } else if (block === Block.Dirt) {
    ctx.fillStyle = "#a57854";
    for (const [px, py, size] of [[4, 9, 3], [20, 15, 4], [11, 25, 3], [27, 4, 2]]) {
      ctx.fillRect(x + px, py, size, 2);
    }
  } else if (block === Block.Stone || block === Block.Bedrock) {
    ctx.fillStyle = block === Block.Stone ? "#93a09a" : "#59666c";
    ctx.fillRect(x + 4, 5, 8, 3);
    ctx.fillRect(x + 20, 18, 7, 3);
    ctx.fillStyle = "#465654";
    ctx.fillRect(x + 15, 11, 3, 5);
    ctx.fillRect(x + 5, 24, 4, 3);
  } else if ([Block.PineLog, Block.OakLog, Block.BirchLog, Block.JungleLog, Block.DeadwoodLog].some((log) => log === block)) {
    ctx.fillStyle = "#c28b4d";
    ctx.fillRect(x + 5, 0, 4, TILE_ART_SIZE);
    ctx.fillStyle = "#704c32";
    ctx.fillRect(x + 23, 0, 3, TILE_ART_SIZE);
    for (let py = 4; py < TILE_ART_SIZE; py += 9) ctx.fillRect(x + 12, py, 5, 2);
  } else if (block === Block.Leaves || block === Block.Branch || block === Block.OakLeaf || block === Block.PineNeedle) {
    ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    ctx.fillStyle = definition.color;
    ctx.fillRect(x + 3, 4, 24, 23);
    ctx.fillStyle = block === Block.Leaves ? "#71a763" : "#a3a65b";
    ctx.fillRect(x + 7, 7, 9, 5);
    ctx.fillRect(x + 19, 17, 5, 6);
    if (block === Block.Branch) {
      ctx.fillStyle = "#7b5940";
      ctx.fillRect(x + 14, 14, 14, 4);
    }
  } else if (block === Block.Ladder) {
    ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    ctx.fillStyle = "#765432";
    ctx.fillRect(x + 7, 0, 4, TILE_ART_SIZE);
    ctx.fillRect(x + 21, 0, 4, TILE_ART_SIZE);
    ctx.fillStyle = "#deb56c";
    for (let py = 4; py < TILE_ART_SIZE; py += 8) ctx.fillRect(x + 8, py, 16, 3);
  } else if (block === Block.Torch) {
    ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    ctx.fillStyle = "#765432";
    ctx.fillRect(x + 13, 14, 6, 16);
    ctx.fillStyle = "#c98c44";
    ctx.fillRect(x + 14, 17, 3, 10);
    ctx.fillStyle = "#e77832";
    ctx.fillRect(x + 10, 5, 12, 12);
    ctx.fillStyle = "#ffd369";
    ctx.fillRect(x + 13, 2, 6, 12);
    ctx.fillStyle = "#fff1b1";
    ctx.fillRect(x + 14, 8, 4, 5);
  } else if (block === Block.WoodStairs || block === Block.StoneStairs) {
    ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    for (let step = 0; step < 4; step++) {
      const top = (3 - step) * (TILE_ART_SIZE / 4);
      ctx.fillStyle = definition.color;
      ctx.fillRect(x + step * 8, top, 8, TILE_ART_SIZE - top);
      ctx.fillStyle = block === Block.WoodStairs ? "#d2a066" : "#a3b0a7";
      ctx.fillRect(x + step * 8, top, 8, 2);
      ctx.fillStyle = block === Block.WoodStairs ? "#704c32" : "#465654";
      ctx.fillRect(x + step * 8, top + 2, 1, TILE_ART_SIZE - top - 2);
    }
  } else if (block === Block.Water) {
    ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = definition.color;
    ctx.fillRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#96C8EF";
    ctx.fillRect(x + 3, 6, 12, 2);
    ctx.fillRect(x + 18, 22, 10, 2);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.25;
    for (const [px, py] of [[4, 7], [21, 18], [10, 26]]) ctx.fillRect(x + px, py, 4, 3);
    ctx.globalAlpha = 1;
  }
}

export function drawItemTexture(ctx: CanvasRenderingContext2D, item: MaterialItemId): void {
  if (item in RESOURCES) {
    ctx.clearRect(0, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    if (drawResourceIcon(ctx, item as keyof typeof RESOURCES)) return;
  }
  if (isBlockItem(item)) {
    drawBlockTexture(ctx, ITEM_BLOCKS[item]);
    return;
  }
  ctx.clearRect(0, 0, TILE_ART_SIZE, TILE_ART_SIZE);
  ctx.fillStyle = RESOURCES[item].color;
  if (item.endsWith("_plant") || ["vine", "tall_grass", "reed", "wild_berry", "herb_mint", "lavender", "aloe"].includes(item)) {
    ctx.fillRect(14, 10, 4, 22);
    ctx.fillRect(6, 12, 9, 5);
    ctx.fillRect(18, 6, 8, 5);
    ctx.fillRect(9, 22, 6, 4);
    return;
  }
  if (item.startsWith("mushroom_")) {
    ctx.fillRect(6, 10, 20, 10);
    ctx.fillStyle = "#E8E2D0";
    ctx.fillRect(13, 20, 6, 12);
    return;
  }
  ctx.fillRect(8, 8, 16, 16);
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.3;
  ctx.fillRect(10, 10, 8, 4);
  ctx.globalAlpha = 1;
}

const itemIconUrls = new Map<MaterialItemId, string>();

export function itemIconUrl(item: MaterialItemId): string {
  const cached = itemIconUrls.get(item);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TILE_ART_SIZE;
  canvas.height = TILE_ART_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de dessiner les icônes des objets.");
  drawItemTexture(ctx, item);
  const url = canvas.toDataURL("image/png");
  itemIconUrls.set(item, url);
  return url;
}

const iconUrls = new Map<BlockId, string>();

export function blockIconUrl(block: BlockId): string {
  const cached = iconUrls.get(block);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TILE_ART_SIZE;
  canvas.height = TILE_ART_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de dessiner les icônes des blocs.");
  drawBlockTexture(ctx, block);
  const url = canvas.toDataURL("image/png");
  iconUrls.set(block, url);
  return url;
}
