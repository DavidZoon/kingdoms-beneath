import { describe, expect, it } from "vitest";
import { DAY_LENGTH_TICKS, dayPhaseAt, daylightAt } from "./WorldClock";

describe("deterministic world clock", () => {
  it("cycles through the four phases and returns to the same light after one day", () => {
    expect(dayPhaseAt(0)).toBe("Jour");
    expect(dayPhaseAt(DAY_LENGTH_TICKS / 4)).toBe("Crépuscule");
    expect(dayPhaseAt(DAY_LENGTH_TICKS / 2)).toBe("Nuit");
    expect(dayPhaseAt(DAY_LENGTH_TICKS * 3 / 4)).toBe("Aube");
    expect(daylightAt(0)).toBeCloseTo(1);
    expect(daylightAt(DAY_LENGTH_TICKS / 2)).toBeCloseTo(0.2);
    expect(daylightAt(1234 + DAY_LENGTH_TICKS)).toBeCloseTo(daylightAt(1234));
  });
});
