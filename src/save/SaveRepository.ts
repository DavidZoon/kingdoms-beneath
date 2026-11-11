import { validateSave } from "./schema";
import type { SaveGame } from "./types";

export class SaveRepository {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly name = "kingdoms-beneath") {}

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("IndexedDB est indisponible dans ce navigateur."));
          return;
        }
        const request = indexedDB.open(this.name, 1);
        let blocked = false;
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("saves")) request.result.createObjectStore("saves");
        };
        request.onblocked = () => {
          blocked = true;
          reject(new Error("Stockage bloqué : fermez les autres onglets du jeu puis réessayez."));
        };
        request.onerror = () => reject(new Error("Impossible d'ouvrir le stockage local.", { cause: request.error }));
        request.onsuccess = () => {
          const database = request.result;
          if (blocked) {
            database.close();
            return;
          }
          database.onversionchange = () => {
            database.close();
            this.database = undefined;
          };
          resolve(database);
        };
      }).catch((error: unknown) => {
        this.database = undefined;
        throw error;
      });
    }
    return this.database;
  }

  private async request<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("saves", mode);
      const request = operation(transaction.objectStore("saves"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(
        new Error("Échec du stockage local. Vérifiez l'espace disponible et les autorisations du navigateur.", {
          cause: transaction.error ?? request.error,
        }),
      );
    });
  }

  async read(): Promise<SaveGame | null> {
    const value: unknown = await this.request("readonly", (store) => store.get("active"));
    return value === undefined ? null : validateSave(value);
  }

  async write(save: SaveGame): Promise<void> {
    const validated = validateSave(save);
    await this.request("readwrite", (store) => store.put(validated, "active"));
  }

  async close(): Promise<void> {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}
