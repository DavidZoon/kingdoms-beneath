interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export function isRunningAsApp(): boolean {
  return window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
}

/** Keeps Chromium's deferred install prompt so the game can offer its own install button. */
export class InstallPrompt {
  private deferred: BeforeInstallPromptEvent | null = null;

  constructor(private readonly onAvailabilityChange: (available: boolean) => void) {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.onAvailabilityChange(true);
    });
    window.addEventListener("appinstalled", () => {
      this.deferred = null;
      this.onAvailabilityChange(false);
    });
  }

  async prompt(): Promise<InstallOutcome> {
    const event = this.deferred;
    if (!event) return "unavailable";
    // A prompt event can only be used once.
    this.deferred = null;
    this.onAvailabilityChange(false);
    await event.prompt();
    return (await event.userChoice).outcome;
  }
}
