import { describe, expect, it } from "vitest";
import { cameraFollowY, hudCameraCenter } from "./camera";

describe("camera centering between the HUD edges", () => {
  it("uses the lowest top element and the highest bottom element", () => {
    expect(hudCameraCenter(
      { top: 0, bottom: 900 },
      [{ top: 0, bottom: 60 }, { top: 65, bottom: 130 }],
      [{ top: 570, bottom: 900 }, { top: 700, bottom: 800 }],
    )).toBeCloseTo(350 / 900);
  });

  it("centers in the viewport when no HUD is visible", () => {
    expect(hudCameraCenter({ top: 20, bottom: 620 }, [], [])).toBe(0.5);
  });

  it("accounts for the canvas position and a mobile status below the header", () => {
    expect(hudCameraCenter(
      { top: 30, bottom: 874 },
      [{ top: 30, bottom: 94 }, { top: 95, bottom: 120 }],
      [{ top: 500, bottom: 860 }],
    )).toBeCloseTo(280 / 844);
  });

  it("reacts to changes in the lower HUD height", () => {
    const viewport = { top: 0, bottom: 844 };
    const topHud = [{ top: 0, bottom: 95 }];
    const before = hudCameraCenter(viewport, topHud, [{ top: 500, bottom: 830 }]);
    const after = hudCameraCenter(viewport, topHud, [{ top: 460, bottom: 830 }]);
    expect((after - before) * 844).toBeCloseTo(-20);
  });

  it.each([1, 1.5, 2, 4])("centers the character rather than an offset point at zoom %s", (zoom) => {
    for (const height of [390, 844, 900]) {
      for (const playerCenter of [100, 800, 2000]) {
        const target = 0.35;
        const center = cameraFollowY(playerCenter, height, zoom, target);
        const playerScreenY = (playerCenter - center) * zoom + height / 2;
        expect(playerScreenY).toBeCloseTo(height * target);
      }
    }
  });
});
