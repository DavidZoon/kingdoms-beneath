import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface PwaHandlers {
  /** `reload` activates the waiting service worker and reloads the page. */
  onNeedRefresh(reload: () => Promise<void>): void;
  onOfflineReady(): void;
}

export function registerPwa(handlers: PwaHandlers): void {
  if (!("serviceWorker" in navigator)) return;
  const updateServiceWorker = registerSW({
    onNeedRefresh: () => handlers.onNeedRefresh(() => updateServiceWorker(true)),
    onOfflineReady: () => handlers.onOfflineReady(),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      window.setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError: (error) => console.error("Kingdoms Beneath: service worker", error),
  });
}
