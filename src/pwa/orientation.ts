export type OrientationPreference = "auto" | "landscape" | "portrait";

export const ORIENTATION_PREFERENCES: readonly OrientationPreference[] = ["auto", "landscape", "portrait"];
export const ORIENTATION_STORAGE_KEY = "kingdoms-beneath:orientation";

// `lock` is Chromium-only and absent from TypeScript's DOM typings.
export interface LockableOrientation {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
}

export function isOrientationPreference(value: unknown): value is OrientationPreference {
  return typeof value === "string" && (ORIENTATION_PREFERENCES as readonly string[]).includes(value);
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readOrientationPreference(
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): OrientationPreference {
  try {
    const value = storage?.getItem(ORIENTATION_STORAGE_KEY);
    return isOrientationPreference(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function writeOrientationPreference(
  preference: OrientationPreference,
  storage: Pick<Storage, "setItem"> | null = defaultStorage(),
): void {
  try {
    storage?.setItem(ORIENTATION_STORAGE_KEY, preference);
  } catch {
    // Private browsing or disabled storage: the choice still applies to the current session.
  }
}

function defaultOrientation(): LockableOrientation | undefined {
  return globalThis.screen?.orientation as LockableOrientation | undefined;
}

/** Resolves to false when the device or browser context cannot lock the orientation. */
export async function applyOrientation(
  preference: OrientationPreference,
  orientation: LockableOrientation | undefined = defaultOrientation(),
): Promise<boolean> {
  if (preference === "auto") {
    try {
      orientation?.unlock?.();
    } catch {
      // Unlocking an unlocked or unsupported screen is harmless.
    }
    return true;
  }
  if (typeof orientation?.lock !== "function") return false;
  try {
    await orientation.lock(preference);
    return true;
  } catch {
    return false;
  }
}
