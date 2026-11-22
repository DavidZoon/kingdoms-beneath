import { describe, expect, it } from "vitest";
import {
  DAY_LENGTH_TICKS, LUNAR_CYCLE_DAYS, celestialProgressAt, dayPhaseAt, daylightAt,
  moonIlluminationAt, moonlightAt,
} from "./WorldClock";

describe("deterministic world clock", () => {
  it("cycles through the four phases and returns to the same light after one day", () => {
    expect(dayPhaseAt(0)).toBe("Jour");
    expect(dayPhaseAt(DAY_LENGTH_TICKS / 4)).toBe("Crépuscule");
    expect(dayPhaseAt(DAY_LENGTH_TICKS / 2)).toBe("Nuit");
    expect(dayPhaseAt(DAY_LENGTH_TICKS * 3 / 4)).toBe("Aube");
    expect(daylightAt(0)).toBeCloseTo(1);
    expect(daylightAt(DAY_LENGTH_TICKS / 2)).toBeCloseTo(0);
    expect(daylightAt(1234 + DAY_LENGTH_TICKS)).toBeCloseTo(daylightAt(1234));
  });

  it("cycles through five moon brightness states and repeats after eight days", () => {
    expect(Array.from({ length: 8 }, (_, day) =>
      moonIlluminationAt(day * DAY_LENGTH_TICKS))).toEqual([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]);
    expect(moonIlluminationAt(LUNAR_CYCLE_DAYS * DAY_LENGTH_TICKS)).toBe(0);
    expect(moonlightAt(0)).toBe(0);
    expect(moonlightAt(1.5 * DAY_LENGTH_TICKS)).toBeCloseTo(0.025);
    expect(moonlightAt(4.5 * DAY_LENGTH_TICKS)).toBeCloseTo(0.1);
  });

  it("keeps celestial progress continuous within one day", () => {
    expect(celestialProgressAt(0)).toBe(0);
    expect(celestialProgressAt(DAY_LENGTH_TICKS / 2)).toBe(0.5);
    expect(celestialProgressAt(DAY_LENGTH_TICKS)).toBe(0);
  });
});
