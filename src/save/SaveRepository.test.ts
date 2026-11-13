import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../game/GameSession";
import { Block, TILE_SIZE } from "../world/blocks";
import { SaveRepository } from "./SaveRepository";
import type { SaveGame } from "./types";

let repository: SaveRepository;
let name: string;

beforeEach(() => {
  name = `kingdoms-test-${crypto.randomUUID()}`;
  repository = new SaveRepository(name);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await repository.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("IndexedDB save slot", () => {
  it("has no resume slot before the first game", async () => {
    expect(await repository.read()).toBeNull();
  });

  it("persists a save across repository connections", async () => {
    const save = GameSession.create("Test", "test", 1000).snapshot(2000);
    await repository.write(save);
    await repository.close();
    repository = new SaveRepository(name);
    expect(await repository.read()).toEqual(save);
  });

  it("reads a v3 slot without data loss and persists its migration on the next save", async () => {
    const save = GameSession.create("Ancienne partie", "test", 1000).snapshot(2000);
    const y = Math.floor(save.player.y / TILE_SIZE);
    save.creativeMode = true;
    save.edits.push({ x: 10, y, block: Block.Stone });
    save.blockDamage.push({ x: 10, y, damage: 2, plane: "foreground" });
    const { lightingQuality: _quality, ...previous } = save;
    const inventory = { dirt: 12, stone: 0, pine_log: 24, ladder: 6 };
    const legacy = { ...previous, schemaVersion: 3, generatorVersion: 2, inventory, selectedItem: "pine_log" };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("saves");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("saves", "readwrite");
      transaction.objectStore("saves").put(legacy, "active");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    const migrated = await repository.read();
    expect(migrated).toMatchObject({
      schemaVersion: 10, generatorVersion: 2, creativeMode: true,
      blockDamage: save.blockDamage, edits: save.edits,
      selectedSlot: 2, lightingQuality: "standard",
    });
    if (!migrated) throw new Error("La sauvegarde migrée est introuvable.");
    expect(migrated.hotbar[0]).toEqual({ itemId: "dirt", quantity: 12 });
    expect(migrated.hotbar[2]).toEqual({ itemId: "pine_log", quantity: 24 });
    expect(migrated.hotbar[4]).toBeNull();
    await repository.write(migrated);
    await repository.close();
    repository = new SaveRepository(name);
    expect(await repository.read()).toEqual(migrated);
  });

  it("replaces the slot only after validating the new state", async () => {
    const save = GameSession.create("Test", "test", 1000).snapshot(2000);
    await repository.write(save);
    const invalid: SaveGame = { ...save, inventory: { ...save.inventory, pine_log: -1 } };
    await expect(repository.write(invalid)).rejects.toThrow(/Inventaire/);
    expect(await repository.read()).toEqual(save);
    const next = { ...save, name: "Imported world" };
    await repository.write(next);
    expect(await repository.read()).toEqual(next);
  });

  it("preserves the previous save when a write transaction aborts", async () => {
    const save = GameSession.create("Test", "test", 1000).snapshot(2000);
    await repository.write(save);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (
      this: IDBObjectStore, value: unknown, key?: IDBValidKey,
    ) {
      const request = put.call(this, value, key);
      this.transaction.abort();
      return request;
    });
    await expect(repository.write({ ...save, name: "Failed write" })).rejects.toThrow(/stockage/);
    expect(await repository.read()).toEqual(save);
  });
});
