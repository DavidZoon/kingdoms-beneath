import { describe, expect, it } from "vitest";
import { BLOCK_ITEMS, TOOL_ITEMS } from "../world/blocks";
import { BlockInteraction, blockActionFor } from "./BlockInteraction";

describe("selection-based block interaction", () => {
  it("mines with an empty shortcut and places every current buildable item", () => {
    expect(blockActionFor(null)).toBe("mine");
    for (const item of BLOCK_ITEMS) expect(blockActionFor(item)).toBe("place");
    for (const item of TOOL_ITEMS) expect(blockActionFor(item)).toBe("mine");
  });

  it("mines while holding a mouse or touch pointer and stops on release", () => {
    for (const touch of [false, true]) {
      const input = new BlockInteraction();
      input.press(1, touch, "empty", "mine");
      expect(input.heldAction("empty")).toBe("mine");
      input.release(1);
      expect(input.heldAction("empty")).toBeNull();
      expect(input.consumePlacement("empty")).toBe(false);
    }
  });

  it("places on a touch tap, including the pointerleave following pointerup", () => {
    const input = new BlockInteraction();
    input.press(1, true, "wood", "place");
    expect(input.heldAction("wood")).toBeNull();
    input.release(1);
    input.cancel(1);
    expect(input.consumePlacement("wood")).toBe(true);
    expect(input.consumePlacement("wood")).toBe(false);
  });

  it("preserves a mouse click shorter than a render frame without duplicating a held placement", () => {
    const input = new BlockInteraction();
    input.press(1, false, "wood", "place");
    input.release(1);
    expect(input.consumePlacement("wood")).toBe(true);
    input.press(2, false, "wood", "place");
    expect(input.heldAction("wood")).toBe("place");
    input.recordPlacement();
    input.release(2);
    expect(input.consumePlacement("wood")).toBe(false);
  });

  it("cancels the whole pinch gesture until all fingers have been released", () => {
    for (const action of ["mine", "place"] as const) {
      const input = new BlockInteraction();
      input.press(1, true, "selected", action);
      input.press(2, true, "selected", action);
      expect(input.heldAction("selected")).toBeNull();
      input.release(2);
      expect(input.heldAction("selected")).toBeNull();
      input.release(1);
      expect(input.consumePlacement("selected")).toBe(false);
      input.press(3, true, "selected", action);
      expect(input.heldAction("selected")).toBe(action === "mine" ? "mine" : null);
    }
  });

  it("does not start mining when the last material is placed or the selected shortcut changes", () => {
    const input = new BlockInteraction();
    input.press(1, false, "2:wood", "place");
    expect(input.heldAction("2:wood")).toBe("place");
    input.recordPlacement();
    expect(input.heldAction("2:empty")).toBeNull();
    input.release(1);
    expect(input.consumePlacement("2:empty")).toBe(false);
    input.press(2, true, "2:wood", "place");
    input.release(2);
    expect(input.consumePlacement("3:wood")).toBe(false);
  });

  it("discards cancelled gestures and pending taps when a panel or pause interrupts play", () => {
    const input = new BlockInteraction();
    input.press(1, true, "wood", "place");
    input.cancel(1);
    input.release(1);
    expect(input.consumePlacement("wood")).toBe(false);
    input.press(2, true, "wood", "place");
    input.release(2);
    input.reset();
    expect(input.consumePlacement("wood")).toBe(false);
    expect(input.heldAction("wood")).toBeNull();
  });

  it("does not interrupt a world gesture when a movement-control pointer is released", () => {
    const input = new BlockInteraction();
    input.press(1, true, "empty", "mine");
    expect(input.release(2)).toBe(false);
    expect(input.cancel(2)).toBe(false);
    expect(input.heldAction("empty")).toBe("mine");
    expect(input.release(1)).toBe(true);
    expect(input.heldAction("empty")).toBeNull();
  });
});
