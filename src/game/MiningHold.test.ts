import { describe, expect, it } from "vitest";
import { MiningHold } from "./MiningHold";

describe("held mining cadence", () => {
  it("waits exactly 250 ms before each hit", () => {
    const hold = new MiningHold();
    expect(hold.advance(249, "1,2")).toBe(0);
    expect(hold.advance(1, "1,2")).toBe(1);
    expect(hold.advance(249, "1,2")).toBe(0);
    expect(hold.advance(1, "1,2")).toBe(1);
    expect(hold.advance(750, "1,2")).toBe(3);
  });

  it("does not accumulate time across releases, target changes or new gestures", () => {
    const hold = new MiningHold();
    hold.advance(200, "1,2:gesture1");
    expect(hold.advance(0, null)).toBe(0);
    expect(hold.advance(100, "1,2:gesture1")).toBe(0);
    expect(hold.advance(200, "2,2:gesture1")).toBe(0);
    expect(hold.advance(100, "2,2:gesture2")).toBe(0);
    hold.reset();
    expect(hold.advance(200, "2,2:gesture2")).toBe(0);
    expect(hold.advance(50, "2,2:gesture2")).toBe(1);
  });
});
