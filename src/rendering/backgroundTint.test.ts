import { describe, expect, it } from "vitest";
import { BACKGROUND_BRIGHTNESS, darkenBackgroundPixels } from "./backgroundTint";

describe("background tile tint", () => {
  it("reduces each color channel to 70 percent while preserving alpha", () => {
    const pixels = new Uint8ClampedArray([200, 100, 50, 255, 255, 1, 0, 128, 12, 24, 36, 0]);
    darkenBackgroundPixels(pixels);
    expect(BACKGROUND_BRIGHTNESS).toBe(0.7);
    expect([...pixels]).toEqual([140, 70, 35, 255, 179, 1, 0, 128, 8, 17, 25, 0]);
  });

  it("rejects incomplete RGBA pixel data", () => {
    expect(() => darkenBackgroundPixels(new Uint8ClampedArray(3))).toThrow(RangeError);
  });
});
