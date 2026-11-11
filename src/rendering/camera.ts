export interface VerticalBounds {
  top: number;
  bottom: number;
}

export function hudCameraCenter(
  viewport: VerticalBounds, topHud: readonly VerticalBounds[], bottomHud: readonly VerticalBounds[],
): number {
  const top = Math.max(viewport.top, ...topHud.map((bounds) => bounds.bottom));
  const bottom = Math.min(viewport.bottom, ...bottomHud.map((bounds) => bounds.top));
  return ((top + bottom) / 2 - viewport.top) / (viewport.bottom - viewport.top);
}

export function cameraFollowY(
  playerCenterY: number, cameraHeight: number, zoom: number, screenCenter: number,
): number {
  return playerCenterY + (0.5 - screenCenter) * cameraHeight / zoom;
}
