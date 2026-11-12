import { Block, BLOCKS, TILE_ART_SIZE, type BlockId } from "../world/blocks";

export function drawBlockTexture(ctx: CanvasRenderingContext2D, block: BlockId, x = 0): void {
  ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
  if (block === Block.Air) return;
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
  } else if (block === Block.Wood) {
    ctx.fillStyle = "#c28b4d";
    ctx.fillRect(x + 5, 0, 4, TILE_ART_SIZE);
    ctx.fillStyle = "#704c32";
    ctx.fillRect(x + 23, 0, 3, TILE_ART_SIZE);
    for (let py = 4; py < TILE_ART_SIZE; py += 9) ctx.fillRect(x + 12, py, 5, 2);
  } else if (block === Block.Leaves || block === Block.Branch) {
    ctx.clearRect(x, 0, TILE_ART_SIZE, TILE_ART_SIZE);
    ctx.fillStyle = block === Block.Leaves ? "#3d7553" : "#66804a";
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
  }
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
