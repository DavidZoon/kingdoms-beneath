import { isBlockItem, type ItemId } from "../world/blocks";

export type BlockAction = "mine" | "place" | "harvest";

export function blockActionFor(item: ItemId | null, plant = false): BlockAction {
  if (plant) return "harvest";
  return item !== null && isBlockItem(item) ? "place" : "mine";
}

interface Gesture {
  pointerId: number;
  selection: string;
  action: BlockAction;
  touch: boolean;
  placementAttempted: boolean;
}

export class BlockInteraction {
  private readonly pointers = new Set<number>();
  private gesture: Gesture | null = null;
  private tap: string | null = null;

  press(pointerId: number, touch: boolean, selection: string, action: BlockAction): void {
    this.pointers.add(pointerId);
    this.tap = null;
    this.gesture = this.pointers.size === 1
      ? { pointerId, selection, action, touch, placementAttempted: false } : null;
  }

  release(pointerId: number): boolean {
    if (!this.pointers.delete(pointerId)) return false;
    const gesture = this.gesture;
    if (gesture?.pointerId === pointerId) {
      if (gesture.action === "place" && !gesture.placementAttempted) this.tap = gesture.selection;
      this.gesture = null;
    }
    return true;
  }

  cancel(pointerId: number): boolean {
    if (!this.pointers.delete(pointerId)) return false;
    this.gesture = null;
    this.tap = null;
    return true;
  }

  reset(): void {
    this.pointers.clear();
    this.gesture = null;
    this.tap = null;
  }

  heldAction(selection: string): BlockAction | null {
    const gesture = this.gesture;
    if (!gesture) return null;
    if (gesture.selection !== selection) {
      this.gesture = null;
      return null;
    }
    return gesture.touch && gesture.action === "place" ? null : gesture.action;
  }

  consumePlacement(selection: string): boolean {
    const place = this.tap === selection;
    this.tap = null;
    return place;
  }

  recordPlacement(): void {
    if (this.gesture) this.gesture.placementAttempted = true;
  }
}
