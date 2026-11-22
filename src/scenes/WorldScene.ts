import Phaser from "phaser";
import type { GameSession } from "../game/GameSession";
import type { InputController } from "../input/InputController";
import { BlockInteraction, blockActionFor } from "../input/BlockInteraction";
import { MiningHold } from "../game/MiningHold";
import { isToolStack } from "../inventory/Inventory";
import {
  calculateLightField, carriedTorchSource, lightBrightness, withLightSources, type LightField,
} from "../lighting/LightField";
import {
  celestialProgressAt, daylightAt, dayPhaseAt, moonIlluminationAt, moonPhaseAt, moonlightAt,
  type DayPhase,
} from "../lighting/WorldClock";
import { getCrackSegments } from "../rendering/blockCracks";
import { darkenBackgroundPixels } from "../rendering/backgroundTint";
import { drawBlockTexture, drawItemTexture } from "../rendering/blockTextures";
import { cameraFollowY, type VerticalBounds } from "../rendering/camera";
import {
  backdropSurfaceY, foregroundPlantPosition, FOREGROUND_PLANT_SPACING, FOREGROUND_SCROLL_FACTOR,
} from "../rendering/parallax";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../player/PlayerController";
import {
  Block, BLOCKS, MATERIAL_ITEMS, TOOL_ITEMS, CHUNK_SIZE, ITEM_LABELS, TILE_ART_SIZE, TILE_SIZE, TOOLS, WORLD_HEIGHT,
  type BlockId, type ConstructionPlane,
} from "../world/blocks";
import { cellKey, chunkOf } from "../world/WorldModel";
import { isPlantItem } from "../world/resources";
import { FRUIT_ITEMS } from "../world/resources";
import { ZOMBIE_MAX_HEALTH } from "../entities/Zombie";

export interface WorldCallbacks {
  onHud: () => void;
  onAction: (message: string) => void;
  getCameraCenterY: (viewport: VerticalBounds) => number;
}

export class WorldScene extends Phaser.Scene {
  paused = false;
  private actor!: Phaser.GameObjects.Image;
  private heldItem!: Phaser.GameObjects.Image;
  private selection!: Phaser.GameObjects.Graphics;
  private backdrop!: Phaser.GameObjects.Graphics;
  private foreground!: Phaser.GameObjects.Graphics;
  private cracks!: Phaser.GameObjects.Graphics;
  private backgroundCracks!: Phaser.GameObjects.Graphics;
  private lighting!: Phaser.GameObjects.Graphics;
  private dropDurability!: Phaser.GameObjects.Graphics;
  private zombies!: Phaser.GameObjects.Graphics;
  private damageFlash!: Phaser.GameObjects.Graphics;
  private readonly miningHold = new MiningHold();
  private readonly blockInteraction = new BlockInteraction();
  private tileAtlas!: Phaser.Textures.CanvasTexture;
  private backgroundAtlas!: Phaser.Textures.CanvasTexture;
  private readonly chunks = new Map<string, Phaser.GameObjects.Image>();
  private readonly backgroundChunks = new Map<string, Phaser.GameObjects.Image>();
  private readonly groundDrops = new Map<string, Phaser.GameObjects.Image>();
  private accumulator = 0;
  private actionCooldown = 0;
  private hudElapsed = 0;
  private pinchDistance = 0;
  private target = { x: 0, y: 0 };
  private tapTarget = { x: 0, y: 0 };
  private lightField: LightField | null = null;
  private lightFieldKey = "";
  private lightRevision = -1;
  private lightRenderKey = "";
  private renderedForegroundRevision = -1;
  private lastDayPhase: DayPhase = "Jour";
  private attackSwingMs = 0;
  private damageFlashMs = 0;
  private lastPlayerHealth = 0;

  constructor(
    private readonly session: GameSession,
    private readonly controls: InputController,
    private readonly callbacks: WorldCallbacks,
  ) {
    super("world");
  }

  preload(): void {
    const files: Record<string, string> = {
      stonePickaxe: "stone-pickaxe.png",
      woodPickaxe: "stone-pickaxe.png",
      copperPickaxe: "stone-pickaxe.png",
      ironPickaxe: "stone-pickaxe.png",
      woodSword: "wood-sword.png",
      copperSword: "copper-sword.png",
      ironSword: "iron-sword.png",
    };
    for (const [item, file] of Object.entries(files)) {
      this.load.image(`drop-${item}`, new URL(`assets/${file}`, document.baseURI).href);
    }
    for (const fruit of FRUIT_ITEMS) {
      this.load.image(`drop-${fruit}`, new URL(`assets/${fruit}.png`, document.baseURI).href);
    }
  }

  create(): void {
    this.cameras.main.setZoom(2);
    this.cameras.main.setBackgroundColor("#91b6a8");
    this.backdrop = this.add.graphics().setDepth(-10);
    this.foreground = this.add.graphics().setDepth(-3);
    this.selection = this.add.graphics().setDepth(5);
    this.cracks = this.add.graphics().setDepth(2);
    this.backgroundCracks = this.add.graphics().setDepth(-1);
    this.lighting = this.add.graphics().setDepth(4.5);
    this.dropDurability = this.add.graphics().setDepth(3.1);
    this.zombies = this.add.graphics().setDepth(3);
    this.damageFlash = this.add.graphics().setDepth(20);
    this.createTileAtlas();
    this.createDropTextures();
    this.createActor();
    this.heldItem = this.add.image(0, 0, "drop-woodSword").setOrigin(0.5, 0.8).setDepth(4.1);
    this.target = {
      x: Math.floor(this.session.player.x / TILE_SIZE) + 2,
      y: Math.floor((this.session.player.y + PLAYER_HEIGHT / 2) / TILE_SIZE),
    };
    this.input.addPointer(1);
    this.input.mouse?.disableContextMenu();
    const point = (event: PointerEvent): void => {
      if (this.paused || !this.controls.canInteract) return;
      const bounds = this.game.canvas.getBoundingClientRect();
      const worldPoint = this.cameras.main.getWorldPoint(
        (event.clientX - bounds.left) * this.scale.gameSize.width / bounds.width,
        (event.clientY - bounds.top) * this.scale.gameSize.height / bounds.height,
      );
      this.target = { x: Math.floor(worldPoint.x / TILE_SIZE), y: Math.floor(worldPoint.y / TILE_SIZE) };
    };
    const press = (event: PointerEvent): void => {
      if (this.paused || this.session.survival.dead || !this.controls.canInteract) return;
      if (event.button === 2) {
        event.preventDefault();
        this.controls.queueAttack();
        return;
      }
      if (event.button !== 0) return;
      point(event);
      this.miningHold.reset();
      this.actionCooldown = 0;
      this.blockInteraction.press(
        event.pointerId, event.pointerType === "touch", this.selectionKey(),
        blockActionFor(this.session.selectedItem, this.session.getPlantTarget(this.target.x, this.target.y) !== null),
      );
    };
    this.game.canvas.addEventListener("pointermove", point);
    this.game.canvas.addEventListener("pointerdown", press);
    const release = (event: PointerEvent): void => {
      if (document.elementFromPoint(event.clientX, event.clientY) !== this.game.canvas) {
        if (this.blockInteraction.cancel(event.pointerId)) this.miningHold.reset();
        return;
      }
      if (this.blockInteraction.release(event.pointerId)) {
        point(event);
        this.tapTarget = { ...this.target };
        this.miningHold.reset();
      }
    };
    const cancel = (event: PointerEvent): void => {
      if (this.blockInteraction.cancel(event.pointerId)) this.miningHold.reset();
    };
    const reset = (): void => {
      this.blockInteraction.reset();
      this.miningHold.reset();
    };
    this.game.canvas.addEventListener("pointerleave", cancel);
    this.game.canvas.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", reset);
    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
        if (!this.paused && pointer.event.target === this.game.canvas) this.zoomBy(dy > 0 ? -0.5 : 0.5);
      },
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener("pointermove", point);
      this.game.canvas.removeEventListener("pointerdown", press);
      this.game.canvas.removeEventListener("pointerleave", cancel);
      this.game.canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", reset);
      for (const image of this.groundDrops.values()) image.destroy();
      this.groundDrops.clear();
      for (const [key, image] of this.chunks) {
        image.destroy();
        this.textures.remove(`terrain-${key}`);
      }
      this.chunks.clear();
      for (const [key, image] of this.backgroundChunks) {
        image.destroy();
        this.textures.remove(`background-${key}`);
      }
      this.backgroundChunks.clear();
    });
    this.callbacks.onHud();
    this.lastDayPhase = dayPhaseAt(this.session.tick);
    this.lastPlayerHealth = this.session.survival.health;
  }

  zoomBy(delta: number): void {
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + delta, 1, 4));
  }

  private selectionKey(): string {
    const plane = blockActionFor(this.session.selectedItem) === "mine" ? "auto" : this.session.selectedPlane;
    return `${this.session.selectedSlot}:${this.session.selectedItem ?? "empty"}:${this.session.selectedRotation}:${plane}`;
  }

  update(_time: number, delta: number): void {
    if (this.paused) {
      this.accumulator = 0;
      this.blockInteraction.reset();
      this.miningHold.reset();
      return;
    }
    const elapsed = Math.min(delta, 100);
    this.accumulator += elapsed;
    while (this.accumulator >= 1000 / 60) {
      this.session.step(this.controls.consumeMovement());
      this.accumulator -= 1000 / 60;
    }
    this.syncGroundDrops();
    this.handlePinch();
    this.actionCooldown -= elapsed;
    if (!this.controls.canInteract) this.blockInteraction.reset();
    if (this.controls.consumeAttack()) {
      const result = this.session.attackForward();
      if (result.ok) this.attackSwingMs = 140;
      this.callbacks.onAction(!result.ok ? result.reason :
        !result.hit ? "Coup dans le vide." :
        result.toolBroken ? "L'arme ou l'outil s'est cassé." :
        result.killed ? `Coup fatal : ${result.damage} dégâts.` :
          `Attaque : ${result.damage} dégâts.`);
      this.callbacks.onHud();
    }
    const selection = this.selectionKey();
    const action = !this.session.survival.dead && this.controls.canInteract && this.pinchDistance === 0
      ? this.blockInteraction.heldAction(selection) : null;
    const tapPlacement = this.blockInteraction.consumePlacement(selection);
    const { x, y } = this.target;
    const plantCell = this.session.getPlantTarget(x, y);
    const miningCell = blockActionFor(this.session.selectedItem) === "mine"
      ? this.session.getMiningTarget(x, y) : null;
    const miningTarget = action === "harvest"
      ? plantCell ? `${cellKey(x, y)}:${selection}:${plantCell.id}` : null
      : action === "mine"
      ? `${cellKey(x, y)}:${selection}:${miningCell
        ? `${cellKey(miningCell.x, miningCell.y)}:${miningCell.plane}:${this.session.world.getBlockOnPlane(miningCell.x, miningCell.y, miningCell.plane)}`
        : "unreachable"}`
      : null;
    const miningTicks = this.miningHold.advance(delta, miningTarget);
    for (let tick = 0; tick < miningTicks; tick++) {
      if (action === "harvest" && plantCell) {
        const result = this.session.harvestPlant(x, y);
        this.callbacks.onAction(result.ok ? `Cueillette : ${ITEM_LABELS[plantCell.itemId]}.` : result.reason);
        if (result.ok) this.callbacks.onHud();
        this.miningHold.reset();
        break;
      }
      if (!miningCell) {
        this.callbacks.onAction("Cible hors de portée.");
        this.miningHold.reset();
        break;
      }
      const result = this.session.mine(x, y);
      if (result.ok) {
        const { x: minedX, y: minedY, plane } = miningCell;
        const material = this.session.world.getBlockOnPlane(minedX, minedY, plane);
        const durability = BLOCKS[material].durability ?? 0;
        const materialLabel = this.session.miningMaterialLabel(minedX, minedY, plane);
        this.callbacks.onAction(result.toolBroken ? "L'outil s'est cassé." : result.destroyed ? "Bloc récolté." :
          `Minage de ${materialLabel} en cours · durabilité ${durability - this.session.getBlockDamage(minedX, minedY, plane)} / ${durability}`);
        if (result.destroyed) {
          this.redrawChunk(chunkOf(minedX), chunkOf(minedY));
          this.miningHold.reset();
        }
        this.callbacks.onHud();
        if (result.destroyed) break;
      } else {
        if ("reason" in result) this.callbacks.onAction(result.reason);
        this.miningHold.reset();
        break;
      }
    }
    if ((action === "place" && this.actionCooldown <= 0) ||
        (tapPlacement && !this.session.survival.dead && this.controls.canInteract && this.pinchDistance === 0)) {
      const placementTarget = tapPlacement ? this.tapTarget : this.target;
      const result = this.session.place(placementTarget.x, placementTarget.y);
      this.blockInteraction.recordPlacement();
      this.callbacks.onAction(result.ok ? "Bloc placé." : result.reason);
      if (result.ok) {
        this.redrawChunk(chunkOf(placementTarget.x), chunkOf(placementTarget.y));
        this.callbacks.onHud();
      }
      this.actionCooldown = 180;
    }
    const { player } = this.session;
    this.actor.setPosition(player.x, player.y);
    this.actor.setFlipX((player.facing ?? 1) < 0);
    this.actor.setAlpha(this.session.survival.dead ? 0.3 :
      this.session.survival.invulnerabilityTicks > 0 && Math.floor(this.session.tick / 4) % 2 === 0 ? 0.45 : 1);
    this.drawZombies();
    this.updateHeldItem(elapsed);
    if (this.session.survival.health < this.lastPlayerHealth) this.damageFlashMs = 180;
    this.lastPlayerHealth = this.session.survival.health;
    this.damageFlashMs = Math.max(0, this.damageFlashMs - elapsed);
    this.damageFlash.clear();
    if (this.damageFlashMs > 0) {
      const view = this.cameras.main.worldView;
      const alpha = 0.22 + 0.55 * this.damageFlashMs / 180;
      const edge = 8 / this.cameras.main.zoom;
      this.damageFlash.fillStyle(0xb3242a, alpha)
        .fillRect(view.x, view.y, view.width, edge)
        .fillRect(view.x, view.y + view.height - edge, view.width, edge)
        .fillRect(view.x, view.y + edge, edge, view.height - edge * 2)
        .fillRect(view.x + view.width - edge, view.y + edge, edge, view.height - edge * 2);
      this.damageFlash.lineStyle(6, 0xe5484d, alpha).strokeRect(
        view.x + 3, view.y + 3, view.width - 6, view.height - 6,
      );
    }
    this.updateCameraAndChunks();
    const selectionTarget = plantCell ?? miningCell ?? this.target;
    this.selection.clear().lineStyle(1, this.session.withinReach(this.target.x, this.target.y) ? 0xf6e5ad : 0xc76852);
    this.selection.strokeRect(selectionTarget.x * TILE_SIZE, selectionTarget.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const phase = dayPhaseAt(this.session.tick);
    if (phase !== this.lastDayPhase) {
      if (phase === "Crépuscule") this.callbacks.onAction("Crépuscule : préparez torches, atelier et défenses.");
      if (phase === "Nuit") this.callbacks.onAction("Horde nocturne : les zombies apparaissent en surface.");
      this.callbacks.onHud();
      this.lastDayPhase = phase;
    }
    this.hudElapsed += elapsed;
    if (this.hudElapsed >= 200) {
      this.callbacks.onHud();
      this.hudElapsed = 0;
    }
  }

  private drawZombies(): void {
    this.zombies.clear();
    for (const zombie of this.session.zombies) {
      this.zombies.fillStyle(0x456b4d);
      this.zombies.fillRect(zombie.x + 2, zombie.y + 3, 8, 12);
      this.zombies.fillRect(zombie.x, zombie.y + 13, 12, 10);
      this.zombies.fillStyle(0x9ac46d);
      this.zombies.fillRect(zombie.x + 3, zombie.y, 6, 5);
      this.zombies.fillStyle(0x15251f);
      this.zombies.fillRect(zombie.x + 3, zombie.y + 1, 2, 2);
      this.zombies.fillRect(zombie.x + 7, zombie.y + 1, 2, 2);
      this.zombies.fillStyle(0x6d8e64);
      this.zombies.fillRect(zombie.x, zombie.y + 23, 4, 3);
      this.zombies.fillRect(zombie.x + 8, zombie.y + 23, 4, 3);
      this.zombies.fillStyle(0x301f1b, 0.85);
      this.zombies.fillRect(zombie.x - 2, zombie.y - 5, 16, 3);
      this.zombies.fillStyle(0xa5cb63);
      this.zombies.fillRect(zombie.x - 2, zombie.y - 5, 16 * zombie.health / ZOMBIE_MAX_HEALTH, 3);
    }
  }

  private updateHeldItem(delta: number): void {
    this.attackSwingMs = Math.max(0, this.attackSwingMs - delta);
    const selected = this.session.selectedItem;
    this.heldItem.setVisible(selected !== null && !this.session.survival.dead);
    if (!selected) return;
    const texture = `drop-${selected}`;
    if (this.heldItem.texture.key !== texture) this.heldItem.setTexture(texture);
    const tint = selected === "woodPickaxe" ? 0xa66d3a : selected === "copperPickaxe" ? 0xd18a4a :
      selected === "ironPickaxe" ? 0xc8d2d8 : 0xffffff;
    this.heldItem.setTint(tint);
    const facing = this.session.player.facing ?? 1;
    const progress = this.attackSwingMs > 0 ? 1 - this.attackSwingMs / 140 : 0;
    const swing = this.attackSwingMs > 0 ? (-55 + progress * 110) * facing : -12 * facing;
    this.heldItem
      .setPosition(
        this.session.player.x + (facing > 0 ? PLAYER_WIDTH + 2 : -2),
        this.session.player.y + 14,
      )
      .setDisplaySize(18, 18)
      .setFlipX(facing < 0)
      .setAngle(swing)
      .setAlpha(this.session.survival.invulnerabilityTicks > 0 ? 0.65 : 1);
  }

  private handlePinch(): void {
    const touches = this.input.manager.pointers.filter(
      (pointer) => pointer.isDown && pointer.wasTouch && pointer.event.target === this.game.canvas,
    );
    if (touches.length < 2) {
      this.pinchDistance = 0;
      return;
    }
    const distance = Phaser.Math.Distance.Between(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (this.pinchDistance > 0) {
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * distance / this.pinchDistance, 1, 4));
    }
    this.pinchDistance = distance;
  }

  private createActor(): void {
    const texture = this.textures.createCanvas("colonist", PLAYER_WIDTH, PLAYER_HEIGHT);
    if (!texture) throw new Error("Impossible de créer la texture du personnage.");
    const ctx = texture.context;
    ctx.fillStyle = "#263b3b";
    ctx.fillRect(2, 17, 4, 9);
    ctx.fillRect(7, 17, 4, 9);
    ctx.fillStyle = "#d1a655";
    ctx.fillRect(1, 8, 10, 11);
    ctx.fillStyle = "#f0cf9c";
    ctx.fillRect(3, 2, 8, 7);
    ctx.fillStyle = "#534433";
    ctx.fillRect(2, 0, 9, 3);
    ctx.fillStyle = "#263b3b";
    ctx.fillRect(9, 4, 2, 2);
    texture.refresh();
    this.actor = this.add.image(0, 0, "colonist").setOrigin(0).setDepth(4);
  }

  private createTileAtlas(): void {
    const tileCount = Math.max(...Object.values(Block)) + 1;
    const atlas = this.textures.createCanvas("kb-tiles-32", tileCount * TILE_ART_SIZE, TILE_ART_SIZE);
    if (!atlas) throw new Error("Impossible de créer l'atlas de tuiles 32 × 32.");
    for (const block of Object.values(Block)) {
      drawBlockTexture(atlas.context, block, block * TILE_ART_SIZE);
    }
    atlas.refresh();
    this.tileAtlas = atlas;
    const backgroundAtlas = this.textures.createCanvas("kb-background-tiles-32", tileCount * TILE_ART_SIZE, TILE_ART_SIZE);
    if (!backgroundAtlas) throw new Error("Impossible de créer l'atlas d'arrière-plan.");
    const backgroundContext = backgroundAtlas.context;
    backgroundContext.drawImage(atlas.canvas, 0, 0);
    const pixels = backgroundContext.getImageData(0, 0, tileCount * TILE_ART_SIZE, TILE_ART_SIZE);
    darkenBackgroundPixels(pixels.data);
    backgroundContext.putImageData(pixels, 0, 0);
    backgroundAtlas.refresh();
    this.backgroundAtlas = backgroundAtlas;
  }

  private createDropTextures(): void {
    for (const item of TOOL_ITEMS) {
      if (!this.textures.exists(`drop-${item}`)) throw new Error(`Impossible de charger l'icône de ${ITEM_LABELS[item]}.`);
    }
    for (const item of MATERIAL_ITEMS) {
      if (this.textures.exists(`drop-${item}`)) continue;
      const texture = this.textures.createCanvas(`drop-${item}`, TILE_ART_SIZE, TILE_ART_SIZE);
      if (!texture) throw new Error(`Impossible de créer l'icône de ${ITEM_LABELS[item]}.`);
      drawItemTexture(texture.context, item);
      texture.refresh();
    }
  }

  private syncGroundDrops(): void {
    this.dropDurability.clear();
    const view = this.cameras.main.worldView;
    const drops = [...this.session.groundDrops, ...this.session.naturalPickups(
      Math.floor(view.left / TILE_SIZE), Math.ceil(view.right / TILE_SIZE),
      Math.floor(view.top / TILE_SIZE), Math.ceil(view.bottom / TILE_SIZE),
    )];
    if (this.session.world.generator.version >= 4) {
      for (let x = Math.floor(view.left / TILE_SIZE); x <= Math.ceil(view.right / TILE_SIZE); x++) {
        for (let y = Math.max(0, Math.floor(view.top / TILE_SIZE)); y <= Math.min(WORLD_HEIGHT - 2, Math.ceil(view.bottom / TILE_SIZE)); y++) {
          for (const plant of this.session.plantsAt(x, y)) {
            drops.push({ id: plant.id, x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE,
              itemId: plant.itemId, quantity: 1 });
          }
          const plane = this.session.world.generator.isBackgroundTrunk(x, y) ? "background" : "foreground";
          for (const item of this.session.world.naturalHarvestAt(x, y, plane)) {
            if (isPlantItem(item)) continue;
            drops.push({ id: `harvest:${x},${y}:${item}`, x: (x + 0.5) * TILE_SIZE,
              y: (y + (plane === "background" ? 0.5 : -0.5)) * TILE_SIZE, itemId: item, quantity: 1 });
          }
        }
      }
    }
    const active = new Set(drops.map((drop) => drop.id));
    for (const [id, image] of this.groundDrops) {
      if (!active.has(id)) {
        image.destroy();
        this.groundDrops.delete(id);
      }
    }
    for (const drop of drops) {
      let image = this.groundDrops.get(drop.id);
      if (!image) {
        const harvest = drop.id.startsWith("harvest:") || drop.id.startsWith("plant:");
        image = this.add.image(drop.x, drop.y, `drop-${drop.itemId}`)
          .setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(harvest ? 1 : 3);
        if (drop.itemId === "woodPickaxe") image.setTint(0xa66d3a);
        if (drop.itemId === "copperPickaxe") image.setTint(0xd18a4a);
        if (drop.itemId === "ironPickaxe") image.setTint(0xc8d2d8);
        this.groundDrops.set(drop.id, image);
      }
      image.setPosition(drop.x, drop.y);
      if (isToolStack(drop)) {
        const left = drop.x - TILE_SIZE / 2;
        const top = drop.y + TILE_SIZE / 2 - 3;
        this.dropDurability.fillStyle(0x472e24).fillRect(left, top, TILE_SIZE, 2);
        this.dropDurability.fillStyle(0x9ac85e).fillRect(
          left, top, TILE_SIZE * drop.durability / TOOLS[drop.itemId].maxDurability, 2,
        );
      }
    }
  }

  private updateCameraAndChunks(): void {
    const foregroundRevision = this.session.world.foregroundRevision;
    if (foregroundRevision !== this.renderedForegroundRevision) {
      for (const key of [...this.chunks.keys()]) {
        const [cx, cy] = key.split(",").map(Number);
        this.redrawChunk(cx, cy);
      }
      this.renderedForegroundRevision = foregroundRevision;
    }
    const camera = this.cameras.main;
    const centerX = this.session.player.x + PLAYER_WIDTH / 2;
    const centerY = cameraFollowY(
      this.session.player.y + PLAYER_HEIGHT / 2, camera.height, camera.zoom,
      this.callbacks.getCameraCenterY(this.game.canvas.getBoundingClientRect()),
    );
    camera.centerOn(centerX, centerY);
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    const left = centerX - width / 2;
    const top = centerY - height / 2;
    this.drawBackdrop(left, top, width, height);
    this.drawForeground(left, width);
    this.drawCracks(left, top, width, height);
    const keys = new Set<string>();
    for (let cy = Math.max(0, chunkOf(Math.floor(top / TILE_SIZE)));
      cy <= Math.min(WORLD_HEIGHT / CHUNK_SIZE - 1, chunkOf(Math.floor((top + height) / TILE_SIZE))); cy++) {
      for (let cx = chunkOf(Math.floor(left / TILE_SIZE)); cx <= chunkOf(Math.floor((left + width) / TILE_SIZE)); cx++) {
        const key = cellKey(cx, cy);
        keys.add(key);
        if (!this.chunks.has(key)) this.drawChunk(cx, cy);
      }
    }
    for (const [key, image] of this.chunks) {
      if (!keys.has(key)) {
        image.destroy();
        this.textures.remove(`terrain-${key}`);
        this.chunks.delete(key);
        const background = this.backgroundChunks.get(key);
        if (background) {
          background.destroy();
          this.textures.remove(`background-${key}`);
          this.backgroundChunks.delete(key);
        }
      }
    }
    this.session.world.retainChunks(keys);
    this.drawLighting(left, top, width, height);
  }

  private drawCracks(left: number, top: number, width: number, height: number): void {
    this.cracks.clear().lineStyle(0.75, 0x18251e, 0.95);
    this.backgroundCracks.clear().lineStyle(0.75, 0x18251e, 0.95);
    const scale = TILE_SIZE / TILE_ART_SIZE;
    const layers = [
      { plane: "background", graphics: this.backgroundCracks },
      { plane: "foreground", graphics: this.cracks },
    ] as const;
    for (let y = Math.max(0, Math.floor(top / TILE_SIZE));
      y <= Math.min(WORLD_HEIGHT - 2, Math.floor((top + height) / TILE_SIZE)); y++) {
      for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + width) / TILE_SIZE); x++) {
        for (const { plane, graphics } of layers) {
          const damage = this.session.getBlockDamage(x, y, plane);
          if (damage === 0) continue;
          const durability = BLOCKS[this.session.world.getBlockOnPlane(x, y, plane)].durability;
          if (!durability) continue;
          for (const segment of getCrackSegments(damage / durability)) {
            graphics.lineBetween(
              x * TILE_SIZE + segment.from[0] * scale, y * TILE_SIZE + segment.from[1] * scale,
              x * TILE_SIZE + segment.to[0] * scale, y * TILE_SIZE + segment.to[1] * scale,
            );
          }
        }
      }
    }
  }

  private drawBackdrop(left: number, top: number, width: number, height: number): void {
    this.backdrop.clear();
    this.backdrop.fillStyle(0x91b6a8).fillRect(left, top, width, height);
    const surface = backdropSurfaceY(this.session.world.generator);
    const progress = celestialProgressAt(this.session.tick);
    const skyTop = Math.max(top, top + 18);
    const sunVisible = progress < 1 / 6 || progress >= 5 / 6;
    const moonVisible = progress >= 1 / 3 && progress < 2 / 3;
    if (sunVisible) {
      const dayProgress = ((progress + 1 / 6) % 1) / (1 / 3);
      const sunX = left + width * (0.05 + dayProgress * 0.9);
      const sunY = skyTop + 92 - Math.sin(dayProgress * Math.PI) * Math.min(84, surface - skyTop - 38);
      this.backdrop.fillStyle(0xf5cf65).fillCircle(sunX, sunY, 15);
      this.backdrop.lineStyle(3, 0xf2d98d, 0.45).strokeCircle(sunX, sunY, 21);
    }
    if (moonVisible) {
      const nightProgress = (progress - 1 / 3) * 3;
      const moonX = left + width * (0.05 + nightProgress * 0.9);
      const moonY = skyTop + 92 - Math.sin(nightProgress * Math.PI) * Math.min(84, surface - skyTop - 38);
      const radius = 12;
      const illumination = moonIlluminationAt(this.session.tick);
      if (illumination > 0) {
        this.backdrop.fillStyle(0xdde4ce).fillCircle(moonX, moonY, radius);
        if (illumination < 1) {
          const waxing = moonPhaseAt(this.session.tick) < 4;
          const shadowOffset = (waxing ? -1 : 1) * radius * 2 * illumination;
          this.backdrop.fillStyle(0x91b6a8).fillCircle(moonX + shadowOffset, moonY, radius);
        }
      }
    }
    for (const layer of [
      { color: 0x7d9d8b, factor: 0.2, offset: -95, scale: 0.006 },
      { color: 0x608575, factor: 0.55, offset: -35, scale: 0.011 },
    ]) {
      this.backdrop.fillStyle(layer.color);
      this.backdrop.beginPath();
      this.backdrop.moveTo(left - 32, top + height);
      for (let x = left - 32; x <= left + width + 32; x += 16) {
        const parallaxX = x - left * (1 - layer.factor);
        const y = surface + layer.offset + Math.sin(parallaxX * layer.scale) * 42 +
          Math.cos(parallaxX * layer.scale * 2.1) * 15;
        this.backdrop.lineTo(x, y);
      }
      this.backdrop.lineTo(left + width + 32, top + height);
      this.backdrop.closePath();
      this.backdrop.fillPath();
    }
    const forestScroll = left * 0.7;
    this.backdrop.fillStyle(0x4b705e);
    for (let tree = Math.floor(forestScroll / 38) - 1; tree <= Math.ceil((forestScroll + width) / 38); tree++) {
      const x = left + tree * 38 - forestScroll;
      const base = surface - 9 + Math.sin(tree * 2.4) * 7;
      const treeHeight = 24 + Math.abs(tree % 3) * 8;
      this.backdrop.fillRect(x - 2, base - treeHeight / 2, 4, treeHeight / 2);
      this.backdrop.fillTriangle(x - 12, base - 8, x, base - treeHeight, x + 12, base - 8);
    }
    this.backdrop.fillStyle(0x3e5149);
    this.backdrop.beginPath();
    this.backdrop.moveTo(left - 32, top + height);
    for (let x = Math.floor((left - 32) / TILE_SIZE) * TILE_SIZE; x <= left + width + 32; x += TILE_SIZE) {
      const y = this.session.world.generator.surfaceAt(Math.floor(x / TILE_SIZE)) * TILE_SIZE + 6;
      this.backdrop.lineTo(x, y);
    }
    this.backdrop.lineTo(left + width + 32, top + height);
    this.backdrop.closePath();
    this.backdrop.fillPath();
    this.backdrop.fillStyle(0x2d413d, 0.5);
    for (let y = Math.floor(top / 64) * 64; y < top + height; y += 64) {
      for (let x = Math.floor(left / 64) * 64; x < left + width; x += 64) {
        if (y > this.session.world.generator.surfaceAt(Math.floor(x / TILE_SIZE)) * TILE_SIZE + 32) {
          this.backdrop.fillRect(x + 9, y + 13, 18, 3);
          this.backdrop.fillRect(x + 38, y + 37, 10, 2);
        }
      }
    }
  }

  private drawForeground(left: number, width: number): void {
    this.foreground.clear().fillStyle(0x264f3b, 0.45);
    const scroll = left * FOREGROUND_SCROLL_FACTOR;
    for (let plant = Math.floor(scroll / FOREGROUND_PLANT_SPACING) - 1;
      plant <= Math.ceil((scroll + width) / FOREGROUND_PLANT_SPACING); plant++) {
      const { x, groundY: ground } = foregroundPlantPosition(this.session.world.generator, plant, left);
      this.foreground.fillRect(x, ground - 10, 3, 10);
      this.foreground.fillRect(x - 5, ground - 6, 5, 3);
      this.foreground.fillRect(x + 3, ground - 8, 5, 3);
    }
  }

  private drawLighting(left: number, top: number, width: number, height: number): void {
    if (!this.session.lightEnabled) {
      if (this.lightRenderKey === "disabled") return;
      this.lightRenderKey = "disabled";
      this.lighting.clear();
      return;
    }
    const minX = Math.floor(left / TILE_SIZE);
    const maxX = Math.floor((left + width) / TILE_SIZE);
    const topCell = Math.floor(top / TILE_SIZE);
    const bottomCell = Math.floor((top + height) / TILE_SIZE);
    const minY = topCell;
    const maxY = Math.min(WORLD_HEIGHT - 1, bottomCell);
    const quality = this.session.lightingQuality;
    const levels = quality === "reduced" ? 8 : 24;
    const daylightStep = Math.round(daylightAt(this.session.tick) * levels);
    const boundsKey = `${minX},${maxX},${minY},${maxY}`;
    const revision = this.session.world.foregroundRevision;
    const carried = carriedTorchSource(this.session.player, this.session.selectedItem);
    const carriedKey = carried ? `${carried.x},${carried.y},${carried.range}` : "";
    const renderKey = `${boundsKey},${topCell},${bottomCell},${revision},${quality},${daylightStep},${carriedKey},enabled`;
    if (renderKey === this.lightRenderKey) return;
    this.lightRenderKey = renderKey;
    this.lighting.clear();
    const daylight = daylightStep / levels;
    const moonlight = moonlightAt(this.session.tick);
    if (bottomCell >= WORLD_HEIGHT) {
      this.lighting.fillStyle(0x09131f, 1).fillRect(
        minX * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE, (maxX - minX + 1) * TILE_SIZE,
        (bottomCell - WORLD_HEIGHT + 1) * TILE_SIZE,
      );
    }
    if (minY > maxY) return;
    if (!this.lightField || boundsKey !== this.lightFieldKey || revision !== this.lightRevision) {
      this.lightField = calculateLightField(this.session.world, { minX, maxX, minY, maxY });
      this.lightFieldKey = boundsKey;
      this.lightRevision = revision;
    }
    const field = carried ? withLightSources(this.session.world, this.lightField, [carried]) : this.lightField;
    const drawRuns = (
      y: number, valueAt: (index: number, x: number) => number, color: number, alphaScale: number,
    ): void => {
      let runStart = minX;
      let previous = -1;
      for (let x = minX; x <= maxX + 1; x++) {
        const index = (y - field.minY) * field.width + x - field.minX;
        const value = x <= maxX ? valueAt(index, x) : -1;
        if (value === previous) continue;
        if (previous > 0) {
          this.lighting.fillStyle(color, previous * alphaScale).fillRect(
            runStart * TILE_SIZE, y * TILE_SIZE, (x - runStart) * TILE_SIZE, TILE_SIZE,
          );
        }
        runStart = x;
        previous = value;
      }
    };
    for (let y = minY; y <= maxY; y++) {
      drawRuns(y, (index, x) => Math.round(
        (1 - lightBrightness(
          field.sky[index], field.torch[index], daylight, y > this.session.world.generator.surfaceAt(x),
          moonlight,
        )) * levels,
      ), 0x09131f, 1 / levels);
    }
    if (quality === "standard") {
      for (let y = minY; y <= maxY; y++) {
        drawRuns(y, (index) => Math.round(
          field.torch[index] * (1 - field.sky[index] * (daylight + moonlight)) * 4,
        ), 0xdb8736, 0.035);
      }
    }
  }

  private redrawChunk(cx: number, cy: number): void {
    const key = cellKey(cx, cy);
    const image = this.chunks.get(key);
    if (!image) return;
    image.destroy();
    this.textures.remove(`terrain-${key}`);
    this.chunks.delete(key);
    const background = this.backgroundChunks.get(key);
    if (background) {
      background.destroy();
      this.textures.remove(`background-${key}`);
      this.backgroundChunks.delete(key);
    }
    this.drawChunk(cx, cy);
  }

  private drawChunk(cx: number, cy: number): void {
    const key = cellKey(cx, cy);
    const background = this.session.world.getBackgroundChunk(cx, cy);
    if (background.some((block) => block !== Block.Air)) {
      this.backgroundChunks.set(key, this.drawChunkPlane(cx, cy, background, "background"));
    }
    this.chunks.set(key, this.drawChunkPlane(cx, cy, this.session.world.getChunk(cx, cy), "foreground"));
  }

  private drawChunkPlane(
    cx: number, cy: number, cells: Uint8Array, plane: ConstructionPlane,
  ): Phaser.GameObjects.Image {
    const key = cellKey(cx, cy);
    const textureKey = `${plane === "foreground" ? "terrain" : "background"}-${key}`;
    const size = CHUNK_SIZE * TILE_ART_SIZE;
    const texture = this.textures.createCanvas(textureKey, size, size);
    if (!texture) throw new Error("Impossible de créer une texture de terrain.");
    const ctx = texture.context;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = cells[y * CHUNK_SIZE + x] as BlockId;
        if (block === Block.Air) continue;
        const worldX = cx * CHUNK_SIZE + x;
        const worldY = cy * CHUNK_SIZE + y;
        const rotation = this.session.world.getRotationOnPlane(worldX, worldY, plane);
        const atlas = plane === "background" &&
          !(block === Block.PineLog && this.session.world.getBackgroundOrigin(worldX, worldY) === "trunk")
          ? this.backgroundAtlas : this.tileAtlas;
        ctx.save();
        ctx.translate((x + 0.5) * TILE_ART_SIZE, (y + 0.5) * TILE_ART_SIZE);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(
          atlas.canvas, block * TILE_ART_SIZE, 0, TILE_ART_SIZE, TILE_ART_SIZE,
          -TILE_ART_SIZE / 2, -TILE_ART_SIZE / 2, TILE_ART_SIZE, TILE_ART_SIZE,
        );
        ctx.restore();
      }
    }
    texture.refresh();
    return this.add.image(cx * CHUNK_SIZE * TILE_SIZE, cy * CHUNK_SIZE * TILE_SIZE, textureKey)
      .setOrigin(0)
      .setScale(TILE_SIZE / TILE_ART_SIZE)
      .setDepth(plane === "foreground" ? 0 : -2);
  }
}
