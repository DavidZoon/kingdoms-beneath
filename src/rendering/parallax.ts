import type { WorldGenerator } from "../generation/WorldGenerator";
import { TILE_SIZE } from "../world/blocks";

export const FOREGROUND_PLANT_SPACING = 54;
export const FOREGROUND_SCROLL_FACTOR = 1.15;

type SurfaceGenerator = Pick<WorldGenerator, "surfaceAt">;

export function backdropSurfaceY(generator: SurfaceGenerator): number {
  // The distant landscape belongs to the seed, not the terrain under the camera.
  return generator.surfaceAt(0) * TILE_SIZE;
}

export function foregroundPlantPosition(
  generator: SurfaceGenerator, index: number, left: number,
): { x: number; groundY: number } {
  const position = index * FOREGROUND_PLANT_SPACING;
  // Sample the fixed anchor instead of the camera-shifted drawing position.
  const anchorX = position / FOREGROUND_SCROLL_FACTOR;
  return {
    x: left + position - left * FOREGROUND_SCROLL_FACTOR,
    groundY: generator.surfaceAt(Math.floor(anchorX / TILE_SIZE)) * TILE_SIZE,
  };
}
