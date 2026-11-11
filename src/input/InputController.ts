import type { MovementInput } from "../player/PlayerController";

type HoldAction = "left" | "right" | "run" | "up" | "down";
type Mode = "menu" | "playing" | "paused";

export class InputController {
  private mode: Mode = "menu";
  private readonly keys = new Set<string>();
  private readonly held = new Map<string, Set<number>>();
  private jumpQueued = false;
  private inventoryOpen = false;

  constructor(
    onPause: () => void,
    onSelect: (index: number) => void,
    onInventory: () => void,
    onDrop: () => void,
  ) {
    window.addEventListener("keydown", (event) => {
      if (this.mode !== "menu" && event.code === "Escape" && !event.repeat) {
        event.preventDefault();
        onPause();
        return;
      }
      if (event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, select, dialog")) return;
      if ((event.code === "Space" || event.code === "Enter") && event.target instanceof Element &&
          event.target.closest("[data-toggle-plane], [data-rotate]")) return;
      if (this.mode !== "playing") return;
      if (event.code === "KeyI" && !event.repeat) onInventory();
      if (event.code === "KeyG" && !event.repeat) onDrop();
      const slot = [
        "Digit1", "Digit2", "Digit3", "Digit4", "Digit5",
        "Digit6", "Digit7", "Digit8", "Digit9", "Digit0",
      ].indexOf(event.code);
      if (slot >= 0) onSelect(slot);
      if (event.code === "Space" && !event.repeat) {
        this.jumpQueued = true;
      }
      if (["Space", "ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"].includes(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => this.clear());
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.inventoryOpen = false;
    this.clear();
  }

  setInventoryOpen(open: boolean): void {
    this.inventoryOpen = open;
    this.clear();
  }

  private clear(): void {
    this.keys.clear();
    this.held.clear();
    this.jumpQueued = false;
  }

  bindButton(button: HTMLButtonElement, action: HoldAction | "jump"): void {
    button.addEventListener("pointerdown", (event) => {
      if (!this.canInteract) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (action === "jump") {
        this.jumpQueued = true;
      } else {
        const pointers = this.held.get(action) ?? new Set<number>();
        pointers.add(event.pointerId);
        this.held.set(action, pointers);
      }
    });
    const release = (event: PointerEvent): void => {
      this.held.get(action)?.delete(event.pointerId);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  isHeld(action: HoldAction): boolean {
    return this.canInteract && (this.held.get(action)?.size ?? 0) > 0;
  }

  get canInteract(): boolean {
    return this.mode === "playing" && !this.inventoryOpen;
  }

  consumeMovement(): MovementInput {
    if (this.mode !== "playing" || this.inventoryOpen) {
      return { left: false, right: false, jump: false, run: false, up: false, down: false };
    }
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return {
      left: this.isHeld("left") || this.keys.has("KeyA") || this.keys.has("KeyQ") || this.keys.has("ArrowLeft"),
      right: this.isHeld("right") || this.keys.has("KeyD") || this.keys.has("ArrowRight"),
      run: this.isHeld("run") || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      jump,
      up: this.isHeld("up") || this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.keys.has("KeyZ"),
      down: this.isHeld("down") || this.keys.has("ArrowDown") || this.keys.has("KeyS"),
    };
  }
}
