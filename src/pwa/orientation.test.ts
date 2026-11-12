import { describe, expect, it, vi } from "vitest";
import {
  applyOrientation, ORIENTATION_STORAGE_KEY, readOrientationPreference, writeOrientationPreference,
} from "./orientation";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[ORIENTATION_STORAGE_KEY, initial]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("orientation preference", () => {
  it("defaults to auto when missing, invalid or unreadable", () => {
    expect(readOrientationPreference(memoryStorage())).toBe("auto");
    expect(readOrientationPreference(memoryStorage("sideways"))).toBe("auto");
    expect(readOrientationPreference({ getItem: () => { throw new Error("denied"); } })).toBe("auto");
    expect(readOrientationPreference(null)).toBe("auto");
  });

  it("persists a chosen orientation and tolerates storage failures", () => {
    const storage = memoryStorage();
    writeOrientationPreference("portrait", storage);
    expect(readOrientationPreference(storage)).toBe("portrait");
    expect(() => writeOrientationPreference("landscape", { setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });
});

describe("applyOrientation", () => {
  it("locks the requested orientation", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    await expect(applyOrientation("landscape", { lock, unlock: vi.fn() })).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("unlocks in automatic mode", async () => {
    const unlock = vi.fn();
    await expect(applyOrientation("auto", { lock: vi.fn(), unlock })).resolves.toBe(true);
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("reports when locking is rejected or unsupported", async () => {
    const lock = vi.fn().mockRejectedValue(new DOMException("Not fullscreen", "NotSupportedError"));
    await expect(applyOrientation("portrait", { lock })).resolves.toBe(false);
    await expect(applyOrientation("portrait", {})).resolves.toBe(false);
    await expect(applyOrientation("portrait", undefined)).resolves.toBe(false);
  });
});
