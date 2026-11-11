export type LightingQuality = "standard" | "reduced";

export function isLightingQuality(value: unknown): value is LightingQuality {
  return value === "standard" || value === "reduced";
}
