export const DAY_LENGTH_TICKS = 60 * 60 * 8;
export const LUNAR_CYCLE_DAYS = 8;

export type DayPhase = "Jour" | "Crépuscule" | "Nuit" | "Aube";

export function daylightAt(tick: number): number {
  const progress = (tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
  return (1 + Math.cos(progress * 2 * Math.PI)) / 2;
}

export function dayPhaseAt(tick: number): DayPhase {
  const progress = (tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
  if (progress < 1 / 6 || progress >= 5 / 6) return "Jour";
  if (progress < 1 / 3) return "Crépuscule";
  if (progress < 2 / 3) return "Nuit";
  return "Aube";
}

export function moonPhaseAt(tick: number): number {
  const day = Math.floor(tick / DAY_LENGTH_TICKS);
  return ((day % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
}

export function moonIlluminationAt(tick: number): number {
  const phase = moonPhaseAt(tick);
  return 1 - Math.abs(phase - LUNAR_CYCLE_DAYS / 2) / (LUNAR_CYCLE_DAYS / 2);
}

export function moonlightAt(tick: number): number {
  return moonIlluminationAt(tick) * 0.1 * (1 - daylightAt(tick));
}

export function celestialProgressAt(tick: number): number {
  return (tick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
}
