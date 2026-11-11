export const MINING_TICK_MS = 250;

export class MiningHold {
  private target: string | null = null;
  private elapsed = 0;

  reset(): void {
    this.target = null;
    this.elapsed = 0;
  }

  advance(delta: number, target: string | null): number {
    if (target === null) {
      this.reset();
      return 0;
    }
    if (target !== this.target) {
      this.elapsed = 0;
      this.target = target;
    }
    this.elapsed += delta;
    const ticks = Math.floor(this.elapsed / MINING_TICK_MS);
    this.elapsed -= ticks * MINING_TICK_MS;
    return ticks;
  }
}
