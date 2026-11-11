import Phaser from "phaser";
import { WorldScene, type WorldCallbacks } from "../scenes/WorldScene";
import type { InputController } from "../input/InputController";
import type { GameSession } from "./GameSession";

export class Game {
  private readonly instance: Phaser.Game;
  private readonly world: WorldScene;

  constructor(parent: HTMLElement, session: GameSession, controls: InputController, callbacks: WorldCallbacks) {
    this.world = new WorldScene(session, controls, callbacks);
    this.instance = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: "#17212b",
      pixelArt: true,
      roundPixels: true,
      banner: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [this.world],
    });
  }

  setPaused(paused: boolean): void {
    this.world.paused = paused;
  }

  zoomBy(delta: number): void {
    if (this.world.sys.isActive()) this.world.zoomBy(delta);
  }

  destroy(): void {
    this.instance.destroy(true);
  }
}
