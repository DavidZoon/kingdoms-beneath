export const DAY_LENGTH_TICKS = 60 * 60 * 8;

export type DayPhase = "Jour" | "Crépuscule" | "Nuit" | "Aube";

export function daylightAt(tick: number): number {
  const progress = (tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
  return 0.2 + 0.8 * (1 + Math.cos(progress * 2 * Math.PI)) / 2;
}

export function dayPhaseAt(tick: number): DayPhase {
  const progress = (tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
  if (progress < 1 / 6 || progress >= 5 / 6) return "Jour";
  if (progress < 1 / 3) return "Crépuscule";
  if (progress < 2 / 3) return "Nuit";
  return "Aube";
}
