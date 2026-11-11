export const BACKGROUND_BRIGHTNESS = 0.7;

export function darkenBackgroundPixels(pixels: Uint8ClampedArray): void {
  if (pixels.length % 4 !== 0) throw new RangeError("Données de pixels RGBA invalides.");
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = Math.round(pixels[index] * BACKGROUND_BRIGHTNESS);
    pixels[index + 1] = Math.round(pixels[index + 1] * BACKGROUND_BRIGHTNESS);
    pixels[index + 2] = Math.round(pixels[index + 2] * BACKGROUND_BRIGHTNESS);
  }
}
