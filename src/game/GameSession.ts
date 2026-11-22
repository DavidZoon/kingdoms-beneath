import {
  PLAYER_HEIGHT, PLAYER_WIDTH, overlapsPlayer, playerOverlapsSolid, stepPlayer,
  type MovementInput, type PlayerState,
} from "../player/PlayerController";
import type { BlockDamage, GroundDrop, SaveGame } from "../save/types";
import {
  addItems, availableItemSpace, emptyInventory, getStacks, HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT,
  ITEM_CAPACITY, STACK_SIZE, cloneInventory, isToolStack, removeInventoryStack, type ItemStack, type SlotLocation,
} from "../inventory/Inventory";
import {
  isRecipeId, RECIPES, requiredMaterials, validCraftQuantity, type CraftJob, type RecipeId,
} from "../crafting/Recipes";
import {
  Block, BLOCKS, ITEM_BLOCKS, ITEM_LABELS, MATERIAL_ITEMS, MAX_TILE_X, TILE_SIZE, WORLD_HEIGHT,
  ITEM_PLANES, STATION_BLOCKS, TOOLS, canPlaceItemOnPlane, canUseItemOnPlane, isBlockItem, isConstructionPlane, isItemId, isLiquidBlock, isToolItem, rotateQuarterTurn,
  type ConstructionPlane, type Inventory, type ItemId, type Rotation, type StationId,
} from "../world/blocks";
import { cellKey, WorldModel } from "../world/WorldModel";
import {
  CONSUMABLE_HEALING, isConsumableItem, isPlantItem, type PlantItemId,
} from "../world/resources";
import type { LightingQuality } from "../lighting/quality";
import { DIFFICULTIES, isDifficultyId, type DifficultyId } from "../survival/Difficulty";
import {
  PLAYER_MAX_HEALTH, RESPAWN_INVULNERABILITY_TICKS, RESPAWN_TICKS, type SurvivalState,
} from "../survival/SurvivalState";
import {
  ZOMBIE_DIG_COOLDOWN, ZOMBIE_HEIGHT, ZOMBIE_WIDTH, separateZombies, spawnZombie, stepZombie,
  zombieMiningTarget, zombieOverlapsTile,
  type NightWaveState, type ZombieState,
} from "../entities/Zombie";
import { DAY_LENGTH_TICKS, dayPhaseAt } from "../lighting/WorldClock";
import { CHEST_CAPACITY, chestItemForBlock, type ChestState } from "../inventory/Chest";

export const MAX_STACK = ITEM_CAPACITY;
export const MAX_EDITS = 100_000;
export const MAX_GROUND_DROPS = 10_000;
const PICKUP_RANGE = 24;
const STATION_RANGE = 4 * TILE_SIZE;
const damageKey = (x: number, y: number, plane: ConstructionPlane): string => `${plane}:${cellKey(x, y)}`;

function storeNewItems(
  inventory: Inventory,
  hotbar: Array<ItemStack | null>,
  itemId: ItemId,
  quantity: number,
  durability?: number,
): number {
  let stored = 0;
  let remaining = quantity;
  if (isToolItem(itemId)) {
    const value = durability ?? TOOLS[itemId].maxDurability;
    for (let index = 0; index < hotbar.length && remaining > 0; index++) {
      if (hotbar[index] !== null) continue;
      hotbar[index] = { itemId, quantity: 1, durability: value };
      stored++;
      remaining--;
    }
    if (remaining > 0) {
      const added = addItems(inventory, itemId, remaining, [], value);
      stored += added;
    }
    return stored;
  }
  for (const stack of hotbar) {
    if (remaining === 0) break;
    if (!stack || isToolStack(stack) || stack.itemId !== itemId) continue;
    const added = Math.min(remaining, STACK_SIZE - stack.quantity);
    stack.quantity += added;
    stored += added;
    remaining -= added;
  }
  for (let index = 0; index < hotbar.length && remaining > 0; index++) {
    if (hotbar[index] !== null) continue;
    const added = Math.min(remaining, STACK_SIZE);
    hotbar[index] = { itemId, quantity: added };
    stored += added;
    remaining -= added;
  }
  return stored + addItems(inventory, itemId, remaining);
}

export type ActionResult = { ok: true } | { ok: false; reason: string };
export type MiningResult =
  | { ok: true; destroyed: boolean; toolBroken?: boolean }
  | { ok: false; reason: string }
  | { ok: false; silent: true };
export type ResourceGrantResult = { ok: true; added: number } | { ok: false; reason: string };
export interface MiningTarget {
  x: number;
  y: number;
  plane: ConstructionPlane;
}

export interface NaturalPlant {
  id: string;
  x: number;
  y: number;
  itemId: PlantItemId;
}

export class GameSession {
  readonly world: WorldModel;
  readonly player: PlayerState;
  readonly inventory: Inventory;
  readonly hotbar: Array<ItemStack | null>;
  readonly hotbarPlanes: ConstructionPlane[];
  readonly groundDrops: GroundDrop[];
  private readonly collectedNaturalPickups: Set<string>;
  private readonly collectedPlants: Set<string>;
  selectedSlot: number;
  crafting: CraftJob | null;
  tick: number;
  lightingQuality: LightingQuality;
  difficulty: DifficultyId;
  readonly survival: SurvivalState;
  readonly zombies: ZombieState[];
  readonly nightWave: NightWaveState;
  readonly chests: ChestState[];
  private readonly header: SaveGame;
  private readonly damage = new Map<string, BlockDamage>();
  private creative: boolean;
  private attackCooldown = 0;

  constructor(save: SaveGame) {
    this.header = save;
    this.world = new WorldModel(save.seed, save.edits, save.generatorVersion, save.backgroundEdits);
    this.player = { ...save.player };
    this.inventory = cloneInventory(save.inventory);
    this.hotbar = save.hotbar.map((stack) => stack ? { ...stack } : null);
    this.hotbarPlanes = [...save.hotbarPlanes];
    this.groundDrops = save.groundDrops.map((drop) => ({ ...drop }));
    this.collectedNaturalPickups = new Set(save.collectedNaturalPickups);
    this.collectedPlants = new Set(save.collectedPlants);
    this.selectedSlot = save.selectedSlot;
    this.crafting = save.crafting ? { ...save.crafting } : null;
    this.tick = save.tick;
    this.lightingQuality = save.lightingQuality;
    this.difficulty = save.difficulty;
    this.survival = {
      ...save.survival,
      spawnPoint: { ...save.survival.spawnPoint },
      initialSpawnPoint: { ...save.survival.initialSpawnPoint },
      respawnBed: save.survival.respawnBed ? { ...save.survival.respawnBed } : null,
    };
    this.zombies = save.zombies.map((zombie) => ({ ...zombie }));
    this.nightWave = { ...save.nightWave };
    this.chests = save.chests.map((chest) => ({
      ...chest, slots: chest.slots.map((stack) => stack ? { ...stack } : null),
    }));
    this.creative = save.creativeMode;
    for (const entry of save.blockDamage) this.damage.set(damageKey(entry.x, entry.y, entry.plane), { ...entry });
  }

  static create(name: string, seed: string, now = Date.now()): GameSession {
    const world = new WorldModel(seed, [], 8);
    return new GameSession({
      format: "kingdoms-beneath",
      schemaVersion: 18,
      generatorVersion: 8,
      id: crypto.randomUUID(),
      name,
      seed,
      createdAt: now,
      updatedAt: now,
      tick: 0,
      player: {
        x: 8 * TILE_SIZE,
        y: world.generator.surfaceAt(8) * TILE_SIZE - PLAYER_HEIGHT,
        vx: 0, vy: 0, grounded: true, climbing: false, facing: 1,
      },
      inventory: emptyInventory(),
      hotbar: [
        { itemId: "dirt", quantity: 12 },
        { itemId: "woodSword", quantity: 1, durability: TOOLS.woodSword.maxDurability },
        { itemId: "pine_log", quantity: 24 },
        { itemId: "ladder", quantity: 6 }, { itemId: "torch", quantity: 4 },
        null, null, null, null, null,
      ],
      hotbarPlanes: Array.from({ length: HOTBAR_SLOT_COUNT }, () => "foreground"),
      selectedSlot: 2,
      crafting: null,
      difficulty: "standard",
      survival: {
        health: PLAYER_MAX_HEALTH,
        invulnerabilityTicks: 0,
        dead: false,
        respawnTicks: 0,
        spawnPoint: {
          x: 8 * TILE_SIZE,
          y: world.generator.surfaceAt(8) * TILE_SIZE - PLAYER_HEIGHT,
        },
        initialSpawnPoint: {
          x: 8 * TILE_SIZE,
          y: world.generator.surfaceAt(8) * TILE_SIZE - PLAYER_HEIGHT,
        },
        respawnBed: null,
      },
      zombies: [],
      nightWave: { lastStartedDay: -1, pending: 0, nextSpawnTick: 0 },
      chests: [],
      edits: [],
      backgroundEdits: [],
      groundDrops: [],
      collectedNaturalPickups: [],
      collectedPlants: [],
      blockDamage: [],
      creativeMode: false,
      lightingQuality: "standard",
    });
  }

  get creativeMode(): boolean {
    return this.creative;
  }

  get selectedItem(): ItemId | null {
    return this.hotbar[this.selectedSlot]?.itemId ?? null;
  }

  get selectedRotation(): Rotation {
    return this.hotbar[this.selectedSlot]?.rotation ?? 0;
  }

  get selectedPlane(): ConstructionPlane {
    return this.hotbarPlanes[this.selectedSlot];
  }

  setHotbarPlane(index: number, plane: ConstructionPlane): ActionResult {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SLOT_COUNT || !isConstructionPlane(plane)) {
      return { ok: false, reason: "Plan ou emplacement de raccourci invalide." };
    }
    const stack = this.hotbar[index];
    if (!stack || isToolStack(stack)) {
      return { ok: false, reason: "Le plan de minage est automatique : premier plan, puis arrière-plan." };
    }
    if (!isBlockItem(stack.itemId)) {
      return { ok: false, reason: "Cet objet n'est pas un bloc de construction." };
    }
    if (!canUseItemOnPlane(stack.itemId, plane)) {
      return { ok: false, reason: `${ITEM_LABELS[stack.itemId]} ne peut pas être utilisé sur ce plan.` };
    }
    this.hotbarPlanes[index] = plane;
    return { ok: true };
  }

  toggleHotbarPlane(index: number): ActionResult {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SLOT_COUNT) {
      return { ok: false, reason: "Emplacement de raccourci invalide." };
    }
    return this.setHotbarPlane(index, this.hotbarPlanes[index] === "foreground" ? "background" : "foreground");
  }

  private normalizeHotbarPlane(index: number): void {
    const stack = this.hotbar[index];
    if (!stack || canUseItemOnPlane(stack.itemId, this.hotbarPlanes[index])) return;
    const allowed = ITEM_PLANES[stack.itemId][0];
    if (!allowed) throw new Error(`Aucun plan de construction défini pour ${stack.itemId}.`);
    this.hotbarPlanes[index] = allowed;
  }

  rotateSelected(direction: -1 | 1): ActionResult {
    if (direction !== -1 && direction !== 1) return { ok: false, reason: "Sens de rotation invalide." };
    const stack = this.hotbar[this.selectedSlot];
    if (!stack) return { ok: false, reason: "L'emplacement sélectionné est vide." };
    if (isToolStack(stack)) return { ok: false, reason: "Les outils ne peuvent pas pivoter." };
    if (!isBlockItem(stack.itemId)) return { ok: false, reason: "Cet objet n'est pas un bloc de construction." };
    const rotation = rotateQuarterTurn(this.selectedRotation, direction);
    if (rotation === 0) delete stack.rotation;
    else stack.rotation = rotation;
    return { ok: true };
  }

  selectHotbar(index: number): ActionResult {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SLOT_COUNT) {
      return { ok: false, reason: "Emplacement de raccourci invalide." };
    }
    this.selectedSlot = index;
    return { ok: true };
  }

  moveInventoryToHotbar(inventoryIndex: number, hotbarIndex: number): ActionResult {
    if (!Number.isInteger(inventoryIndex) || inventoryIndex < 0 || inventoryIndex >= INVENTORY_SLOT_COUNT ||
        !Number.isInteger(hotbarIndex) || hotbarIndex < 0 || hotbarIndex >= HOTBAR_SLOT_COUNT) {
      return { ok: false, reason: "Emplacement invalide." };
    }
    const stack = getStacks(this.inventory)[inventoryIndex];
    if (!stack) return { ok: false, reason: "Cet emplacement d'inventaire est vide." };
    const previous = this.hotbar[hotbarIndex];
    if (!isToolStack(stack) && previous && !isToolStack(previous) && previous.itemId === stack.itemId) {
      const transferred = Math.min(stack.quantity, STACK_SIZE - previous.quantity);
      this.inventory[stack.itemId] -= transferred;
      previous.quantity += transferred;
      return { ok: true };
    }
    const next = cloneInventory(this.inventory);
    removeInventoryStack(next, inventoryIndex, stack.quantity);
    if (previous && addItems(next, previous.itemId, previous.quantity, [], previous.durability) !== previous.quantity) {
      return { ok: false, reason: "Inventaire plein : impossible d'y remettre la pile remplacée." };
    }
    Object.assign(this.inventory, next);
    this.hotbar[hotbarIndex] = { ...stack };
    this.normalizeHotbarPlane(hotbarIndex);
    return { ok: true };
  }

  moveHotbarToInventory(hotbarIndex: number): ActionResult {
    if (!Number.isInteger(hotbarIndex) || hotbarIndex < 0 || hotbarIndex >= HOTBAR_SLOT_COUNT) {
      return { ok: false, reason: "Emplacement de raccourci invalide." };
    }
    const stack = this.hotbar[hotbarIndex];
    if (!stack) return { ok: false, reason: "Cet emplacement de raccourci est vide." };
    const next = cloneInventory(this.inventory);
    if (addItems(next, stack.itemId, stack.quantity, [], stack.durability) !== stack.quantity) {
      return { ok: false, reason: "Inventaire plein : la pile entière ne peut pas être déplacée." };
    }
    Object.assign(this.inventory, next);
    this.hotbar[hotbarIndex] = null;
    return { ok: true };
  }

  swapHotbar(first: number, second: number): ActionResult {
    if (![first, second].every((index) => Number.isInteger(index) && index >= 0 && index < HOTBAR_SLOT_COUNT)) {
      return { ok: false, reason: "Emplacement de raccourci invalide." };
    }
    if (first === second) return { ok: true };
    const source = this.hotbar[first];
    const target = this.hotbar[second];
    if (source && target && !isToolStack(source) && !isToolStack(target) && target.itemId === source.itemId) {
      const transferred = Math.min(source.quantity, STACK_SIZE - target.quantity);
      const overflow = source.quantity - transferred;
      const next = cloneInventory(this.inventory);
      if (addItems(next, source.itemId, overflow) !== overflow) {
        return { ok: false, reason: "Inventaire plein : impossible d'y remettre le surplus." };
      }
      Object.assign(this.inventory, next);
      target.quantity += transferred;
      this.hotbar[first] = null;
      return { ok: true };
    }
    [this.hotbar[first], this.hotbar[second]] = [this.hotbar[second], this.hotbar[first]];
    this.normalizeHotbarPlane(first);
    this.normalizeHotbarPlane(second);
    return { ok: true };
  }

  totalItems(itemId: ItemId): number {
    const inInventory = isToolItem(itemId)
      ? this.inventory.tools.filter((tool) => tool.itemId === itemId).length
      : this.inventory[itemId];
    return inInventory + this.hotbar.reduce(
      (total, stack) => total + (stack?.itemId === itemId ? stack.quantity : 0), 0,
    );
  }

  consumeSelected(): ActionResult & { healed?: number } {
    const stack = this.hotbar[this.selectedSlot];
    if (!stack || isToolStack(stack) || !isConsumableItem(stack.itemId)) {
      return { ok: false, reason: "Sélectionnez un fruit ou un poisson à consommer." };
    }
    if (this.survival.dead) return { ok: false, reason: "Impossible de consommer pendant la mort." };
    const healed = Math.min(CONSUMABLE_HEALING[stack.itemId], PLAYER_MAX_HEALTH - this.survival.health);
    if (healed === 0) return { ok: false, reason: "Votre santé est déjà au maximum." };
    this.survival.health += healed;
    stack.quantity--;
    if (stack.quantity === 0) this.hotbar[this.selectedSlot] = null;
    return { ok: true, healed };
  }

  setCreativeMode(enabled: boolean): void {
    this.creative = enabled;
  }

  setDifficulty(difficulty: DifficultyId): ActionResult {
    if (!isDifficultyId(difficulty)) return { ok: false, reason: "Difficulté inconnue." };
    this.difficulty = difficulty;
    if (difficulty === "creative") {
      this.creative = true;
      this.zombies.splice(0);
      this.nightWave.pending = 0;
    }
    return { ok: true };
  }

  grantResources(itemId: ItemId, quantity: number): ResourceGrantResult {
    if (!this.creative) return { ok: false, reason: "Activez le Mode créatif dans les options de la partie." };
    if (!isItemId(itemId) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > ITEM_CAPACITY) {
      return { ok: false, reason: `Choisissez une ressource et une quantité entière entre 1 et ${ITEM_CAPACITY}.` };
    }
    const added = storeNewItems(this.inventory, this.hotbar, itemId, quantity);
    if (added === 0) return { ok: false, reason: "Inventaire plein : libérez un emplacement ou une pile." };
    return { ok: true, added };
  }

  stationNearby(station: StationId): boolean {
    const centerX = this.player.x + PLAYER_WIDTH / 2;
    const centerY = this.player.y + PLAYER_HEIGHT / 2;
    const minX = Math.floor((centerX - STATION_RANGE) / TILE_SIZE);
    const maxX = Math.ceil((centerX + STATION_RANGE) / TILE_SIZE);
    const minY = Math.max(0, Math.floor((centerY - STATION_RANGE) / TILE_SIZE));
    const maxY = Math.min(WORLD_HEIGHT - 2, Math.ceil((centerY + STATION_RANGE) / TILE_SIZE));
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (this.world.getBlockOnPlane(x, y, "foreground") === STATION_BLOCKS[station] &&
            Math.hypot(x * TILE_SIZE + TILE_SIZE / 2 - centerX, y * TILE_SIZE + TILE_SIZE / 2 - centerY)
              <= STATION_RANGE) return true;
      }
    }
    return false;
  }

  canCraft(recipeId: RecipeId): boolean {
    const station = RECIPES[recipeId].station;
    return station === null || this.stationNearby(station);
  }

  startCraft(recipeId: RecipeId, quantity: number): ActionResult {
    if (this.crafting) return { ok: false, reason: "Une fabrication est déjà en cours." };
    if (!isRecipeId(recipeId)) return { ok: false, reason: "Recette inconnue." };
    const recipe = RECIPES[recipeId];
    if (recipe.station && !this.stationNearby(recipe.station)) {
      return { ok: false, reason: `Approchez-vous d'un ${ITEM_LABELS[recipe.station]} pour fabriquer cette recette.` };
    }
    if (!validCraftQuantity(recipe, quantity)) {
      return { ok: false, reason: `Choisissez une quantité valide par lots de ${recipe.outputPerRecipe}.` };
    }
    const materials = requiredMaterials(recipe, quantity);
    for (const [itemId, needed] of materials) {
      if (this.totalItems(itemId) < needed) {
        return { ok: false, reason: `Matériaux insuffisants : il faut ${needed} ${ITEM_LABELS[itemId]}.` };
      }
    }
    const next = cloneInventory(this.inventory);
    const hotbar = this.hotbar.map((stack) => stack ? { ...stack } : null);
    for (const [itemId, needed] of materials) {
      const fromInventory = Math.min(next[itemId], needed);
      next[itemId] -= fromInventory;
      let remaining = needed - fromInventory;
      for (let index = 0; index < hotbar.length && remaining > 0; index++) {
        const stack = hotbar[index];
        if (!stack || stack.itemId !== itemId) continue;
        const used = Math.min(stack.quantity, remaining);
        stack.quantity -= used;
        remaining -= used;
        if (stack.quantity === 0) hotbar[index] = null;
      }
    }
    const outputInventory = cloneInventory(next);
    const outputHotbar = hotbar.map((stack) => stack ? { ...stack } : null);
    if (storeNewItems(outputInventory, outputHotbar, recipe.output, quantity) < quantity) {
      return {
        ok: false,
        reason: "Rangement plein : libérez assez de place dans l'inventaire ou les piles des raccourcis pour toute la fabrication.",
      };
    }
    Object.assign(this.inventory, next);
    this.hotbar.splice(0, this.hotbar.length, ...hotbar);
    this.crafting = { recipeId, quantity, completed: 0, progressTicks: 0 };
    return { ok: true };
  }

  get craftingBlocked(): boolean {
    const job = this.crafting;
    if (!job || job.progressTicks !== RECIPES[job.recipeId].ticksPerItem) return false;
    const inventory = cloneInventory(this.inventory);
    const hotbar = this.hotbar.map((stack) => stack ? { ...stack } : null);
    return storeNewItems(inventory, hotbar, RECIPES[job.recipeId].output, 1) === 0;
  }

  cancelCraft(): ActionResult {
    const job = this.crafting;
    if (!job) return { ok: false, reason: "Aucune fabrication n'est en cours." };
    const recipe = RECIPES[job.recipeId];
    const unstartedBatches = Math.max(
      0,
      job.quantity / recipe.outputPerRecipe - Math.ceil(job.completed / recipe.outputPerRecipe),
    );
    const refundable = recipe.outputPerRecipe * unstartedBatches;
    const next = cloneInventory(this.inventory);
    const hotbar = this.hotbar.map((stack) => stack ? { ...stack } : null);
    for (const [itemId, quantity] of refundable > 0 ? requiredMaterials(recipe, refundable) : []) {
      if (addItems(next, itemId, quantity, hotbar) !== quantity) {
        return { ok: false, reason: "Rangement plein : libérez de la place avant d'annuler la fabrication." };
      }
    }
    Object.assign(this.inventory, next);
    this.hotbar.splice(0, this.hotbar.length, ...hotbar);
    this.crafting = null;
    return { ok: true };
  }

  private advanceCraft(): void {
    const job = this.crafting;
    if (!job) return;
    const recipe = RECIPES[job.recipeId];
    job.progressTicks = Math.min(job.progressTicks + 1, recipe.ticksPerItem);
    if (job.progressTicks < recipe.ticksPerItem ||
        storeNewItems(this.inventory, this.hotbar, recipe.output, 1) !== 1) return;
    job.completed++;
    job.progressTicks = 0;
    if (job.completed === job.quantity) this.crafting = null;
  }

  getBlockDamage(x: number, y: number, plane: ConstructionPlane = "foreground"): number {
    return this.damage.get(damageKey(x, y, plane))?.damage ?? 0;
  }

  miningMaterialLabel(x: number, y: number, plane: ConstructionPlane): string {
    const block = this.world.getBlockOnPlane(x, y, plane);
    const item = BLOCKS[block].drop;
    return item ? ITEM_LABELS[item] : "Bloc";
  }

  takeDamage(amount: number): boolean {
    if (this.difficulty === "creative" || this.survival.dead || this.survival.invulnerabilityTicks > 0 ||
        !Number.isSafeInteger(amount) || amount <= 0) return false;
    this.survival.health = Math.max(0, this.survival.health - amount);
    this.survival.invulnerabilityTicks = 30;
    if (this.survival.health > 0) return true;
    this.applyDeathLoss();
    this.survival.dead = true;
    this.survival.respawnTicks = RESPAWN_TICKS;
    this.player.vx = 0;
    this.player.vy = 0;
    return true;
  }

  private addDeathDrop(stack: ItemStack): number {
    const requested = stack.quantity;
    let remaining = stack.quantity;
    while (remaining > 0 && this.groundDrops.length < MAX_GROUND_DROPS) {
      const quantity = Math.min(STACK_SIZE, remaining);
      this.groundDrops.push({
        id: crypto.randomUUID(),
        x: this.player.x + PLAYER_WIDTH / 2 + ((this.groundDrops.length % 3) - 1) * TILE_SIZE,
        y: this.player.y + PLAYER_HEIGHT / 2,
        itemId: stack.itemId,
        quantity,
        ...(isToolStack(stack) ? { durability: stack.durability } : {}),
      } as GroundDrop);
      remaining -= quantity;
    }
    return requested - remaining;
  }

  private applyDeathLoss(): void {
    const percent = DIFFICULTIES[this.difficulty].deathItemLossPercent;
    if (percent === 0) return;
    for (const itemId of MATERIAL_ITEMS) {
      const inventoryLoss = Math.ceil(this.inventory[itemId] * percent / 100);
      if (inventoryLoss > 0) {
        const dropped = this.addDeathDrop({ itemId, quantity: inventoryLoss });
        this.inventory[itemId] -= dropped;
      }
      for (const stack of this.hotbar) {
        if (!stack || isToolStack(stack) || stack.itemId !== itemId) continue;
        const hotbarLoss = Math.ceil(stack.quantity * percent / 100);
        if (hotbarLoss > 0) {
          stack.quantity -= this.addDeathDrop({ itemId, quantity: hotbarLoss });
        }
      }
    }
    const inventoryToolLoss = Math.ceil(this.inventory.tools.length * percent / 100);
    const inventoryTools = this.inventory.tools.splice(
      Math.max(0, this.inventory.tools.length - inventoryToolLoss), inventoryToolLoss,
    );
    for (const tool of inventoryTools) {
      if (this.addDeathDrop(tool) === 0) this.inventory.tools.push(tool);
    }
    const hotbarTools = this.hotbar.flatMap((stack, index) =>
      stack && isToolStack(stack) ? [{ stack, index }] : []);
    const hotbarToolLoss = Math.ceil(hotbarTools.length * percent / 100);
    for (const entry of hotbarTools.slice(-hotbarToolLoss)) {
      if (this.addDeathDrop(entry.stack) > 0) this.hotbar[entry.index] = null;
    }
    for (let index = 0; index < this.hotbar.length; index++) {
      const stack = this.hotbar[index];
      if (stack && !isToolStack(stack) && stack.quantity === 0) this.hotbar[index] = null;
    }
  }

  get respawning(): boolean {
    return this.survival.dead;
  }

  respawnNow(): ActionResult {
    if (!this.survival.dead) return { ok: false, reason: "Le joueur est toujours vivant." };
    const day = Math.floor(this.tick / DAY_LENGTH_TICKS);
    let morning = day * DAY_LENGTH_TICKS + Math.ceil(DAY_LENGTH_TICKS * 5 / 6);
    if (morning <= this.tick) morning += DAY_LENGTH_TICKS;
    this.tick = morning;
    this.zombies.splice(0);
    this.nightWave.pending = 0;
    this.respawn();
    return { ok: true };
  }

  private damageSpike(x: number, y: number): void {
    const block = this.world.getBlock(x, y);
    const trapDamage = block === Block.WoodSpikes ? 2 : block === Block.IronSpikes ? 5 : 0;
    if (trapDamage === 0) return;
    const key = damageKey(x, y, "foreground");
    const durability = BLOCKS[block].durability;
    if (durability === null) return;
    const nextDamage = this.getBlockDamage(x, y) + 1;
    if (nextDamage >= durability) {
      this.damage.delete(key);
      this.world.setBlock(x, y, Block.Air, 0, true);
    } else {
      this.damage.set(key, { x, y, damage: nextDamage, plane: "foreground" });
    }
  }

  private overlappingSpike(
    x: number, y: number, width: number, height: number,
  ): { x: number; y: number; damage: number } | null {
    const left = Math.floor(x / TILE_SIZE);
    const right = Math.floor((x + width - 0.001) / TILE_SIZE);
    const top = Math.floor(y / TILE_SIZE);
    const bottom = Math.floor((y + height - 0.001) / TILE_SIZE);
    for (let tileY = Math.max(0, top); tileY <= bottom; tileY++) {
      for (let tileX = left; tileX <= right; tileX++) {
        const block = this.world.getBlock(tileX, tileY);
        if (block === Block.WoodSpikes) return { x: tileX, y: tileY, damage: 2 };
        if (block === Block.IronSpikes) return { x: tileX, y: tileY, damage: 5 };
      }
    }
    return null;
  }

  private advanceSpikes(): void {
    if (this.tick % 60 !== 0) return;
    const playerSpike = this.overlappingSpike(this.player.x, this.player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
    if (playerSpike) {
      if (this.takeDamage(playerSpike.damage)) this.damageSpike(playerSpike.x, playerSpike.y);
    }
    for (let index = this.zombies.length - 1; index >= 0; index--) {
      const zombie = this.zombies[index];
      const spike = this.overlappingSpike(zombie.x, zombie.y, ZOMBIE_WIDTH, ZOMBIE_HEIGHT);
      if (!spike) continue;
      zombie.health = Math.max(0, zombie.health - spike.damage);
      this.damageSpike(spike.x, spike.y);
      if (zombie.health === 0) this.zombies.splice(index, 1);
    }
  }

  private respawn(): void {
    const bedStillExists = this.survival.respawnBed &&
      this.world.getBlock(this.survival.respawnBed.x, this.survival.respawnBed.y) === Block.Bed;
    if (!bedStillExists) {
      this.survival.spawnPoint = { ...this.survival.initialSpawnPoint };
      this.survival.respawnBed = null;
    }
    const { x, y } = this.survival.spawnPoint;
    let spawnX = x;
    let spawnY = y;
    let safeSpawn = false;
    for (let rise = 0; rise <= 6 && !safeSpawn; rise++) {
      const candidate = { ...this.player, x, y: Math.max(0, y - rise * TILE_SIZE) };
      if (!playerOverlapsSolid(this.world, candidate)) {
        spawnX = candidate.x;
        spawnY = candidate.y;
        safeSpawn = true;
      }
    }
    if (!safeSpawn) {
      for (let offset = 1; offset <= 10; offset++) {
        for (const direction of [-1, 1] as const) {
          const candidate = {
            ...this.player,
            x: x + direction * offset * TILE_SIZE,
            y: y - 2 * TILE_SIZE,
          };
          if (!playerOverlapsSolid(this.world, candidate)) {
            spawnX = candidate.x;
            spawnY = candidate.y;
            safeSpawn = true;
            break;
          }
        }
        if (safeSpawn) break;
      }
    }
    this.player.x = spawnX;
    this.player.y = spawnY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.grounded = false;
    this.player.climbing = false;
    this.survival.health = PLAYER_MAX_HEALTH;
    this.survival.dead = false;
    this.survival.respawnTicks = 0;
    this.survival.invulnerabilityTicks = RESPAWN_INVULNERABILITY_TICKS;
  }

  private advanceNight(): void {
    if (dayPhaseAt(this.tick) !== "Nuit") {
      this.nightWave.pending = 0;
      return;
    }
    const day = Math.floor(this.tick / DAY_LENGTH_TICKS);
    if (this.nightWave.lastStartedDay !== day) {
      this.nightWave.lastStartedDay = day;
      this.nightWave.pending = DIFFICULTIES[this.difficulty].hordeSize;
      this.nightWave.nextSpawnTick = this.tick;
    }
    if (this.difficulty === "creative" || this.nightWave.pending <= 0 || this.tick < this.nightWave.nextSpawnTick ||
        this.zombies.length >= DIFFICULTIES[this.difficulty].maxActiveZombies) return;
    const direction: -1 | 1 = this.nightWave.pending % 2 === 0 ? 1 : -1;
    const spawnedInWave = DIFFICULTIES[this.difficulty].hordeSize - this.nightWave.pending;
    for (let candidate = 0; candidate < 10; candidate++) {
      const zombie = spawnZombie(
        this.world, this.player, direction, crypto.randomUUID(), spawnedInWave * 2 + candidate,
      );
      if (!zombie) continue;
      this.zombies.push(zombie);
      this.nightWave.pending--;
      this.nightWave.nextSpawnTick = this.tick + DIFFICULTIES[this.difficulty].spawnIntervalTicks;
      return;
    }
    this.nightWave.nextSpawnTick = this.tick + 60;
  }

  private advanceEnemies(): void {
    this.activateCaveMonsters();
    let damage = 0;
    for (const zombie of this.zombies) {
      damage = Math.max(damage, stepZombie(this.world, zombie, this.player, DIFFICULTIES[this.difficulty]).damage);
      const target = zombieMiningTarget(this.world, zombie, this.player);
      if (target && zombie.digCooldown === 0 && this.zombieMineBlock(target.x, target.y)) {
        zombie.digCooldown = ZOMBIE_DIG_COOLDOWN;
      }
    }
    separateZombies(this.world, this.zombies);
    if (damage > 0) this.takeDamage(damage);
  }

  private activateCaveMonsters(): void {
    if (this.tick % 30 !== 0 ||
        this.zombies.length >= DIFFICULTIES[this.difficulty].maxActiveZombies) return;
    const centerX = Math.floor((this.player.x + PLAYER_WIDTH / 2) / TILE_SIZE);
    const centerY = Math.floor((this.player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
    for (let y = centerY - 12; y <= centerY + 12; y++) {
      for (let x = centerX - 12; x <= centerX + 12; x++) {
        if (!this.world.generator.caveMonsterAt(x, y)) continue;
        const marker = `cave-monster:${x},${y}`;
        if (this.collectedNaturalPickups.has(marker) || this.world.getBlock(x, y) !== Block.Air) continue;
        this.collectedNaturalPickups.add(marker);
        this.zombies.push({
          id: `cave-monster-${x}-${y}`,
          x: x * TILE_SIZE + 2,
          y: y * TILE_SIZE,
          vx: 0, vy: 0, health: 40, grounded: false, attackCooldown: 0,
          stunTicks: 0, digCooldown: 0,
        });
        if (this.zombies.length >= DIFFICULTIES[this.difficulty].maxActiveZombies) return;
      }
    }
  }

  private zombieMineBlock(x: number, y: number): boolean {
    const block = this.world.getBlock(x, y);
    const durability = BLOCKS[block].durability;
    if (durability === null || durability <= 0 || block === Block.Bedrock) return false;
    const key = damageKey(x, y, "foreground");
    const damage = this.getBlockDamage(x, y) + 1;
    if (damage < durability) {
      if (!this.damage.has(key) && this.damage.size >= MAX_EDITS) return false;
      this.damage.set(key, { x, y, damage, plane: "foreground" });
      return true;
    }
    if (this.world.editCount >= MAX_EDITS && this.world.wouldAddEdit(x, y, Block.Air, 0, "foreground")) {
      return false;
    }
    const drop = BLOCKS[block].drop;
    const chest = this.chestAt(x, y);
    const chestDrops = chest ? chest.slots.filter((stack): stack is ItemStack => stack !== null) : [];
    if (this.groundDrops.length + (drop ? 1 : 0) + chestDrops.length > MAX_GROUND_DROPS) return false;
    this.world.setBlock(x, y, Block.Air, 0, true);
    this.damage.delete(key);
    if (drop) {
      this.groundDrops.push({
        id: crypto.randomUUID(), x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE,
        itemId: drop, quantity: 1,
      });
    }
    for (const stack of chestDrops) {
      this.groundDrops.push({
        id: crypto.randomUUID(), x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE,
        ...stack,
      });
    }
    if (chest) {
      const chestIndex = this.chests.indexOf(chest);
      if (chestIndex >= 0) this.chests.splice(chestIndex, 1);
    }
    return true;
  }

  getZombieTarget(x: number, y: number): ZombieState | null {
    if (!this.withinReach(x, y) || this.survival.dead) return null;
    const target = this.traceTarget(x, y, "foreground");
    if (target.x !== x || target.y !== y) return null;
    return this.zombies.find((zombie) => zombieOverlapsTile(zombie, x, y)) ?? null;
  }

  attackZombie(x: number, y: number):
    { ok: true; killed: boolean; toolBroken?: boolean } | { ok: false; reason: string } {
    if (this.survival.dead) return { ok: false, reason: "Vous ne pouvez pas attaquer pendant la réapparition." };
    const zombie = this.getZombieTarget(x, y);
    if (!zombie) return { ok: false, reason: "Aucun ennemi accessible ici." };
    zombie.health = Math.max(0, zombie.health - this.miningPower);
    const killed = zombie.health === 0;
    if (killed) {
      const index = this.zombies.indexOf(zombie);
      if (index >= 0) this.zombies.splice(index, 1);
    }
    const tool = this.hotbar[this.selectedSlot];
    if (tool && isToolStack(tool)) {
      tool.durability--;
      if (tool.durability === 0) {
        this.hotbar[this.selectedSlot] = null;
        return { ok: true, killed, toolBroken: true };
      }
    }
    return { ok: true, killed };
  }

  private canSeeZombie(zombie: ZombieState): boolean {
    const x = Math.floor((zombie.x + ZOMBIE_WIDTH / 2) / TILE_SIZE);
    const y = Math.floor((zombie.y + ZOMBIE_HEIGHT / 2) / TILE_SIZE);
    const visible = this.traceTarget(x, y, "foreground");
    return visible.x === x && visible.y === y;
  }

  attackForward():
    { ok: true; hit: boolean; killed: boolean; damage: number; toolBroken?: boolean } |
    { ok: false; reason: string } {
    if (this.survival.dead) {
      return { ok: false, reason: "Vous ne pouvez pas attaquer pendant la réapparition." };
    }
    if (this.attackCooldown > 0) {
      return { ok: false, reason: "Attaque en récupération." };
    }
    this.attackCooldown = 18;
    const stack = this.hotbar[this.selectedSlot];
    const equipment = stack && isToolStack(stack) ? TOOLS[stack.itemId] : null;
    const damage = equipment?.attackDamage ?? 1;
    const range = equipment?.attackRange ?? 16;
    const facing = this.player.facing ?? 1;
    const originX = this.player.x + PLAYER_WIDTH / 2;
    const originY = this.player.y + PLAYER_HEIGHT / 2;
    const target = this.zombies
      .map((zombie) => ({
        zombie,
        distance: (zombie.x + ZOMBIE_WIDTH / 2 - originX) * facing,
      }))
      .filter(({ zombie, distance }) =>
        distance >= 0 && distance <= range && Math.abs(zombie.y + ZOMBIE_HEIGHT / 2 - originY) <= 20 &&
        this.canSeeZombie(zombie))
      .sort((a, b) => a.distance - b.distance)[0]?.zombie;
    if (!target) return { ok: true, hit: false, killed: false, damage };
    target.health = Math.max(0, target.health - damage);
    target.stunTicks = Math.max(target.stunTicks, equipment?.kind === "weapon" ? equipment.stunTicks : 0);
    const killed = target.health === 0;
    if (killed) {
      const index = this.zombies.indexOf(target);
      if (index >= 0) this.zombies.splice(index, 1);
    }
    if (stack && isToolStack(stack)) {
      stack.durability--;
      if (stack.durability === 0) {
        this.hotbar[this.selectedSlot] = null;
        return { ok: true, hit: true, killed, damage, toolBroken: true };
      }
    }
    return { ok: true, hit: true, killed, damage };
  }

  step(input: MovementInput): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - 1);
    if (this.survival.invulnerabilityTicks > 0) this.survival.invulnerabilityTicks--;
    if (this.survival.dead) {
      this.tick++;
      return;
    }

    stepPlayer(this.world, this.player, input);
    this.pickupNearby();
    this.advanceCraft();
    this.advanceNight();
    this.advanceSpikes();
    this.advanceEnemies();
    this.tick++;
  }

  private pickupNearby(): void {
    const centerX = this.player.x + PLAYER_WIDTH / 2;
    const centerY = this.player.y + PLAYER_HEIGHT / 2;
    for (let index = this.groundDrops.length - 1; index >= 0; index--) {
      const drop = this.groundDrops[index];
      if (Math.hypot(centerX - drop.x, centerY - drop.y) > PICKUP_RANGE) continue;
      const collected = storeNewItems(this.inventory, this.hotbar, drop.itemId, drop.quantity, drop.durability);
      if (collected === drop.quantity) this.groundDrops.splice(index, 1);
      else if (!isToolStack(drop)) drop.quantity -= collected;
    }
    for (const drop of this.naturalPickups(
      Math.floor((centerX - PICKUP_RANGE) / TILE_SIZE), Math.ceil((centerX + PICKUP_RANGE) / TILE_SIZE),
      Math.floor((centerY - PICKUP_RANGE) / TILE_SIZE), Math.ceil((centerY + PICKUP_RANGE) / TILE_SIZE),
    )) {
      if (Math.hypot(centerX - drop.x, centerY - drop.y) > PICKUP_RANGE ||
          this.collectedNaturalPickups.size >= MAX_EDITS) continue;
      if (storeNewItems(this.inventory, this.hotbar, drop.itemId, 1) === 1) {
        this.collectedNaturalPickups.add(drop.id);
      }
    }
  }

  naturalPickups(left: number, right: number, top: number, bottom: number): GroundDrop[] {
    const drops: GroundDrop[] = [];
    if (this.world.generator.version < 4) return drops;
    for (let x = Math.max(-MAX_TILE_X, left); x <= Math.min(MAX_TILE_X, right); x++) {
      for (let y = Math.max(0, top); y <= Math.min(WORLD_HEIGHT - 2, bottom); y++) {
        for (const pickup of this.world.generator.pickupsAt(x, y)) {
          const id = `natural:${x},${y}:${pickup.itemId}`;
          if (!this.collectedNaturalPickups.has(id)) drops.push({
            id, x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE, itemId: pickup.itemId, quantity: 1,
          });
        }
      }
    }
    return drops;
  }

  dropSelectedItem(quantity = 1): ActionResult {
    return this.dropStack({ area: "hotbar", index: this.selectedSlot }, quantity);
  }

  dropStack(source: SlotLocation, quantity = 1): ActionResult {
    if ((source.area !== "inventory" && source.area !== "hotbar") ||
        !Number.isInteger(source.index) || source.index < 0 ||
        source.index >= (source.area === "inventory" ? INVENTORY_SLOT_COUNT : HOTBAR_SLOT_COUNT)) {
      return { ok: false, reason: "Emplacement de dépôt invalide." };
    }
    const stack = source.area === "inventory"
      ? getStacks(this.inventory)[source.index] : this.hotbar[source.index];
    if (!stack) return { ok: false, reason: "Aucune ressource à déposer." };
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ok: false, reason: "Quantité à déposer invalide." };
    }
    if (this.groundDrops.length >= MAX_GROUND_DROPS) {
      return { ok: false, reason: "Trop d'objets sont déjà déposés dans ce monde." };
    }
    const amount = Math.min(quantity, STACK_SIZE, stack.quantity);
    const dropped: ItemStack = isToolStack(stack) ? { ...stack } : { itemId: stack.itemId, quantity: amount };
    if (source.area === "inventory") {
      removeInventoryStack(this.inventory, source.index, amount);
    } else if (isToolStack(stack)) {
      this.hotbar[source.index] = null;
    } else {
      stack.quantity -= amount;
      if (stack.quantity === 0) this.hotbar[source.index] = null;
    }
    this.groundDrops.push({
      id: crypto.randomUUID(),
      x: Math.min(MAX_TILE_X * TILE_SIZE, this.player.x + PLAYER_WIDTH / 2 + TILE_SIZE * 2),
      y: this.player.y + PLAYER_HEIGHT / 2,
      ...dropped,
    });
    return { ok: true };
  }

  withinReach(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && Math.abs(x) <= MAX_TILE_X &&
      y >= 0 && y < WORLD_HEIGHT - 1 &&
      Math.hypot(
        (x + 0.5) * TILE_SIZE - this.player.x - PLAYER_WIDTH / 2,
        (y + 0.5) * TILE_SIZE - this.player.y - PLAYER_HEIGHT / 2,
      ) <= 5 * TILE_SIZE;
  }

  nearbyBed(): { x: number; y: number } | null {
    const centerX = Math.floor((this.player.x + PLAYER_WIDTH / 2) / TILE_SIZE);
    const centerY = Math.floor((this.player.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
    let nearest: { x: number; y: number; distance: number } | null = null;
    for (let y = centerY - 2; y <= centerY + 2; y++) {
      for (let x = centerX - 2; x <= centerX + 2; x++) {
        if (this.world.getBlock(x, y) !== Block.Bed) continue;
        const distance = Math.hypot(
          (x + 0.5) * TILE_SIZE - (this.player.x + PLAYER_WIDTH / 2),
          (y + 0.5) * TILE_SIZE - (this.player.y + PLAYER_HEIGHT / 2),
        );
        if (distance <= 3 * TILE_SIZE && (!nearest || distance < nearest.distance)) {
          nearest = { x, y, distance };
        }
      }
    }
    return nearest ? { x: nearest.x, y: nearest.y } : null;
  }

  chestAt(x: number, y: number): ChestState | null {
    const existing = this.chests.find((chest) => chest.x === x && chest.y === y);
    if (existing) return existing;
    const generated = this.world.generator.caveChestAt(x, y);
    if (!generated || this.world.getBlock(x, y) === Block.Air) return null;
    const chest: ChestState = {
      x, y, itemId: generated,
      slots: Array.from({ length: CHEST_CAPACITY[generated] }, () => null),
    };
    this.fillGeneratedChest(chest);
    this.chests.push(chest);
    return chest;
  }

  nearbyChest(): ChestState | null {
    const centerX = this.player.x + PLAYER_WIDTH / 2;
    const centerY = this.player.y + PLAYER_HEIGHT / 2;
    let nearest: { chest: ChestState; distance: number } | null = null;
    const startX = Math.floor(centerX / TILE_SIZE) - 3;
    const startY = Math.floor(centerY / TILE_SIZE) - 3;
    for (let y = startY; y <= startY + 6; y++) {
      for (let x = startX; x <= startX + 6; x++) this.chestAt(x, y);
    }
    for (const chest of this.chests) {
      if (this.world.getBlock(chest.x, chest.y) !== (
        chest.itemId === "smallChest" ? Block.SmallChest :
          chest.itemId === "mediumChest" ? Block.MediumChest : Block.LargeChest
      )) continue;
      const distance = Math.hypot(
        (chest.x + 0.5) * TILE_SIZE - centerX,
        (chest.y + 0.5) * TILE_SIZE - centerY,
      );
      if (distance <= 3 * TILE_SIZE && (!nearest || distance < nearest.distance)) {
        nearest = { chest, distance };
      }
    }
    return nearest?.chest ?? null;
  }

  private fillGeneratedChest(chest: ChestState): void {
    const loot: ItemId[] = [
      "apple", "pear", "peach", "apricot", "fish_raw",
      "coal", "copper_ore", "iron_ore", "stonePickaxe", "copperPickaxe", "ironPickaxe",
    ];
    const count = chest.itemId === "smallChest" ? 4 : chest.itemId === "mediumChest" ? 6 : 9;
    for (let index = 0; index < count; index++) {
      const hash = [...`${this.header.seed}:${chest.x}:${chest.y}:${index}`].reduce(
        (value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261,
      ) >>> 0;
      const itemId = loot[hash % loot.length];
      const slot = (hash >>> 8) % chest.slots.length;
      const quantity = isToolItem(itemId) ? 1 : 1 + (hash >>> 16) % 4;
      chest.slots[slot] = isToolItem(itemId)
        ? { itemId, quantity: 1, durability: TOOLS[itemId].maxDurability }
        : { itemId, quantity };
    }
  }

  movePlayerStackToChest(source: SlotLocation, chestX: number, chestY: number, chestIndex: number): ActionResult {
    const chest = this.chestAt(chestX, chestY);
    if (!chest || !Number.isInteger(chestIndex) || chestIndex < 0 ||
        chestIndex >= chest.slots.length) return { ok: false, reason: "Coffre ou emplacement cible invalide." };
    const target = chest.slots[chestIndex];
    const playerStack = source.area === "inventory"
      ? getStacks(this.inventory)[source.index] : this.hotbar[source.index];
    if (!playerStack) return { ok: false, reason: "Cet emplacement de joueur est vide." };
    if (target && (isToolStack(target) || isToolStack(playerStack) || target.itemId !== playerStack.itemId)) {
      return { ok: false, reason: "Cet emplacement de coffre ne peut pas recevoir cette pile." };
    }
    const amount = target
      ? Math.min(playerStack.quantity, STACK_SIZE - target.quantity)
      : playerStack.quantity;
    if (amount <= 0) return { ok: false, reason: "La pile du coffre est déjà pleine." };
    const nextInventory = cloneInventory(this.inventory);
    const nextHotbar = this.hotbar.map((stack) => stack ? { ...stack } : null);
    if (source.area === "inventory") removeInventoryStack(nextInventory, source.index, amount);
    else if (isToolStack(playerStack)) nextHotbar[source.index] = null;
    else {
      const stack = nextHotbar[source.index];
      if (!stack) return { ok: false, reason: "Pile du raccourci introuvable." };
      stack.quantity -= amount;
      if (stack.quantity === 0) nextHotbar[source.index] = null;
    }
    const next = target && !isToolStack(target)
      ? { ...target, quantity: target.quantity + amount }
      : { ...playerStack, quantity: amount } as ItemStack;
    Object.assign(this.inventory, nextInventory);
    this.hotbar.splice(0, this.hotbar.length, ...nextHotbar);
    chest.slots[chestIndex] = next;
    return { ok: true };
  }

  moveChestStackToPlayer(
    chestX: number, chestY: number, chestIndex: number, destination: SlotLocation,
  ): ActionResult {
    const chest = this.chestAt(chestX, chestY);
    const stack = chest?.slots[chestIndex];
    if (!chest || !stack) return { ok: false, reason: "Cet emplacement de coffre est vide." };
    const nextChestSlots = [...chest.slots];
    const nextInventory = cloneInventory(this.inventory);
    const nextHotbar = this.hotbar.map((entry) => entry ? { ...entry } : null);
    let moved = 0;
    if (destination.area === "hotbar") {
      if (!Number.isInteger(destination.index) || destination.index < 0 ||
          destination.index >= HOTBAR_SLOT_COUNT) return { ok: false, reason: "Raccourci cible invalide." };
      const target = nextHotbar[destination.index];
      if (!target) {
        nextHotbar[destination.index] = { ...stack };
        moved = stack.quantity;
      } else if (!isToolStack(target) && !isToolStack(stack) && target.itemId === stack.itemId) {
        moved = Math.min(stack.quantity, STACK_SIZE - target.quantity);
        target.quantity += moved;
      } else {
        return { ok: false, reason: "Le raccourci cible est incompatible." };
      }
    } else {
      moved = addItems(nextInventory, stack.itemId, stack.quantity, [], stack.durability);
    }
    if (moved === 0) return { ok: false, reason: "Inventaire plein : libérez un emplacement." };
    if (moved === stack.quantity) nextChestSlots[chestIndex] = null;
    else nextChestSlots[chestIndex] = {
      ...stack, quantity: stack.quantity - moved,
    } as ItemStack;
    chest.slots.splice(0, chest.slots.length, ...nextChestSlots);
    Object.assign(this.inventory, nextInventory);
    this.hotbar.splice(0, this.hotbar.length, ...nextHotbar);
    return { ok: true };
  }

  moveChestSlot(chestX: number, chestY: number, from: number, to: number): ActionResult {
    const chest = this.chestAt(chestX, chestY);
    if (!chest || from < 0 || to < 0 || from >= chest.slots.length || to >= chest.slots.length) {
      return { ok: false, reason: "Emplacements de coffre invalides." };
    }
    const source = chest.slots[from];
    const target = chest.slots[to];
    if (!source) return { ok: false, reason: "Cet emplacement de coffre est vide." };
    if (!target) {
      [chest.slots[from], chest.slots[to]] = [null, source];
      return { ok: true };
    }
    if (!isToolStack(source) && !isToolStack(target) && source.itemId === target.itemId) {
      const moved = Math.min(source.quantity, STACK_SIZE - target.quantity);
      target.quantity += moved;
      source.quantity -= moved;
      if (source.quantity === 0) chest.slots[from] = null;
      return { ok: true };
    }
    [chest.slots[from], chest.slots[to]] = [target, source];
    return { ok: true };
  }

  restLabel(): "morning" | "evening" {
    return dayPhaseAt(this.tick) === "Jour" || dayPhaseAt(this.tick) === "Aube" ? "evening" : "morning";
  }

  setRespawnAtNearbyBed(): ActionResult {
    const bed = this.nearbyBed();
    if (!bed) return { ok: false, reason: "Approchez-vous d'un lit pour définir le point de réapparition." };
    this.survival.spawnPoint = {
      x: (bed.x + 0.5) * TILE_SIZE - PLAYER_WIDTH / 2,
      y: bed.y * TILE_SIZE - PLAYER_HEIGHT,
    };
    this.survival.respawnBed = { ...bed };
    return { ok: true };
  }

  restAtNearbyBed(): ActionResult & { target?: "morning" | "evening" } {
    if (!this.nearbyBed()) return { ok: false, reason: "Approchez-vous d'un lit pour vous reposer." };
    if (this.survival.dead) return { ok: false, reason: "Impossible de se reposer pendant la réapparition." };
    const target = this.restLabel();
    const day = Math.floor(this.tick / DAY_LENGTH_TICKS);
    const targetProgress = target === "morning" ? 5 / 6 : 1 / 3;
    let next = day * DAY_LENGTH_TICKS + Math.ceil(DAY_LENGTH_TICKS * targetProgress);
    if (next <= this.tick) next += DAY_LENGTH_TICKS;
    this.tick = next;
    if (target === "morning") {
      this.zombies.splice(0);
      this.nightWave.pending = 0;
    }
    return { ok: true, target };
  }

  private get miningPower(): number {
    const stack = this.hotbar[this.selectedSlot];
    return stack && isToolStack(stack) ? TOOLS[stack.itemId].miningPower : 1;
  }

  private get harvestPower(): number {
    const stack = this.hotbar[this.selectedSlot];
    return stack && isToolStack(stack) ? TOOLS[stack.itemId].harvestDamage : 1;
  }

  plantsAt(x: number, y: number): NaturalPlant[] {
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > MAX_TILE_X ||
        y < 0 || y >= WORLD_HEIGHT - 1 || this.world.generator.version < 4) return [];
    const plants: NaturalPlant[] = [];
    for (const support of [
      { y: y + 1, plane: "foreground" }, { y, plane: "background" },
    ] as const) {
      if (support.plane === "foreground" && this.world.generator.isBackgroundTrunk(x, support.y)) continue;
      for (const item of this.world.naturalHarvestAt(x, support.y, support.plane)) {
        if (!isPlantItem(item)) continue;
        const id = `plant:${cellKey(x, support.y)}:${item}`;
        if (!this.collectedPlants.has(id)) plants.push({ id, x, y, itemId: item });
      }
    }
    return plants;
  }

  getPlantTarget(x: number, y: number): NaturalPlant | null {
    if (!this.withinReach(x, y)) return null;
    const plant = this.plantsAt(x, y)[0];
    if (!plant) return null;
    const visible = this.traceTarget(x, y, "foreground");
    return visible.x === x && visible.y === y ? plant : null;
  }

  harvestPlant(x: number, y: number): ActionResult {
    if (!this.withinReach(x, y)) return { ok: false, reason: "Cible hors de portée." };
    const plant = this.getPlantTarget(x, y);
    if (!plant) return { ok: false, reason: "Aucune plante accessible ici." };
    if (this.collectedPlants.size >= MAX_EDITS) return { ok: false, reason: "Limite de plantes récoltées atteinte." };
    if (availableItemSpace(this.inventory, plant.itemId, this.hotbar) === 0 &&
        this.groundDrops.length >= MAX_GROUND_DROPS) {
      return { ok: false, reason: "Inventaire et espace de dépôt pleins." };
    }
    if (storeNewItems(this.inventory, this.hotbar, plant.itemId, 1) === 0) {
      this.groundDrops.push({
        id: crypto.randomUUID(), x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE,
        itemId: plant.itemId, quantity: 1,
      });
    }
    this.collectedPlants.add(plant.id);
    this.finishMiningHit(true);
    return { ok: true };
  }

  private finishMiningHit(destroyed: boolean): MiningResult {
    const stack = this.hotbar[this.selectedSlot];
    if (stack && isToolStack(stack)) {
      stack.durability--;
      if (stack.durability === 0) {
        this.hotbar[this.selectedSlot] = null;
        return { ok: true, destroyed, toolBroken: true };
      }
    }
    return { ok: true, destroyed };
  }

  getMiningPlane(x: number, y: number): ConstructionPlane {
    return this.world.getBlock(x, y) === Block.Air ? "background" : "foreground";
  }

  getMiningTarget(x: number, y: number): MiningTarget | null {
    if (!this.withinReach(x, y)) return null;
    return this.traceTarget(x, y, this.getMiningPlane(x, y));
  }

  private traceTarget(x: number, y: number, plane: ConstructionPlane): MiningTarget {
    const fromX = (this.player.x + PLAYER_WIDTH / 2) / TILE_SIZE;
    const fromY = (this.player.y + PLAYER_HEIGHT / 2) / TILE_SIZE;
    const dx = x + 0.5 - fromX;
    const dy = y + 0.5 - fromY;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const deltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
    const deltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
    let cellX = Math.floor(fromX);
    let cellY = Math.floor(fromY);
    let nextX = dx === 0 ? Infinity : ((stepX > 0 ? cellX + 1 : cellX) - fromX) / dx;
    let nextY = dy === 0 ? Infinity : ((stepY > 0 ? cellY + 1 : cellY) - fromY) / dy;
    const blocksRay = (cx: number, cy: number): boolean => {
      const block = this.world.getBlockOnPlane(cx, cy, plane);
      return block !== Block.Air && !isLiquidBlock(block) && (plane === "foreground" ||
        (this.world.getBackgroundOrigin(cx, cy) !== "natural" && BLOCKS[block].durability !== null));
    };

    // Visit every crossed cell, including both sides of a corner, without sampling gaps.
    while (true) {
      if (blocksRay(cellX, cellY) || (cellX === x && cellY === y)) {
        return { x: cellX, y: cellY, plane };
      }
      if (Math.abs(nextX - nextY) < 1e-10) {
        if (blocksRay(cellX + stepX, cellY)) return { x: cellX + stepX, y: cellY, plane };
        if (blocksRay(cellX, cellY + stepY)) return { x: cellX, y: cellY + stepY, plane };
        cellX += stepX;
        cellY += stepY;
        nextX += deltaX;
        nextY += deltaY;
      } else if (nextX < nextY) {
        cellX += stepX;
        nextX += deltaX;
      } else {
        cellY += stepY;
        nextY += deltaY;
      }
    }
  }

  mine(targetX: number, targetY: number, requestedPower?: number): MiningResult {
    const preliminary = this.getMiningTarget(targetX, targetY);
    const preliminaryBlock = preliminary ? this.world.getBlockOnPlane(preliminary.x, preliminary.y, preliminary.plane) : null;
    const harvestBlock = preliminaryBlock !== null && [
      Block.PineLog, Block.OakLog, Block.BirchLog, Block.JungleLog, Block.DeadwoodLog,
      Block.Leaves, Block.Branch, Block.OakLeaf, Block.PineNeedle,
    ].some((item) => item === preliminaryBlock);
    const power = requestedPower ?? (harvestBlock ? this.harvestPower : this.miningPower);
    if (!Number.isSafeInteger(power) || power <= 0) {
      return { ok: false, reason: "Puissance de minage invalide." };
    }
    const target = this.getMiningTarget(targetX, targetY);
    if (!target) return { ok: false, reason: "Cible hors de portée." };
    const { x, y, plane } = target;
    const block = this.world.getBlockOnPlane(x, y, plane);
    if (isLiquidBlock(block)) return { ok: false, reason: "Les liquides ne peuvent pas être minés." };
    if (plane === "background" && this.world.getBackgroundOrigin(x, y) === "natural") {
      return { ok: false, silent: true };
    }
    if (block === Block.Air) return { ok: false, reason: "Aucun bloc à miner ici." };
    if (block === Block.Bedrock) return { ok: false, reason: "La roche-mère est indestructible." };
    const durability = BLOCKS[block].durability;
    if (durability === null) return { ok: false, reason: "Ce matériau est indestructible." };
    const key = damageKey(x, y, plane);
    const damage = this.getBlockDamage(x, y, plane) + power;
    if (damage < durability) {
      if (!this.damage.has(key) && this.damage.size >= MAX_EDITS) {
        return { ok: false, reason: "Limite de blocs endommagés atteinte." };
      }
      this.damage.set(key, { x, y, damage, plane });
      return this.finishMiningHit(false);
    }
    const drop = BLOCKS[block].drop;
    const chest = plane === "foreground" ? this.chestAt(x, y) : null;
    const chestDrops = chest ? chest.slots.filter((stack): stack is ItemStack => stack !== null) : [];
    const harvests = this.world.naturalHarvestAt(x, y, plane).filter((item) => !isPlantItem(item));
    const rewards = [...(drop ? [drop] : []), ...harvests];
    if (this.world.editCount >= MAX_EDITS && this.world.wouldAddEdit(x, y, Block.Air, 0, plane)) {
      return { ok: false, reason: "Limite du prototype atteinte : 100 000 blocs modifiés." };
    }
    const nextInventory = cloneInventory(this.inventory);
    const nextHotbar = this.hotbar.map((stack) => stack ? { ...stack } : null);
    const overflow = rewards.filter((item) => storeNewItems(nextInventory, nextHotbar, item, 1) === 0);
    if (this.groundDrops.length + overflow.length + chestDrops.length > MAX_GROUND_DROPS) {
      return { ok: false, reason: "Inventaire et espace de dépôt pleins." };
    }
    this.world.setBlockOnPlane(x, y, Block.Air, 0, plane);
    this.damage.delete(key);
    Object.assign(this.inventory, nextInventory);
    this.hotbar.splice(0, this.hotbar.length, ...nextHotbar);
    for (const item of overflow) {
      this.groundDrops.push({
        id: crypto.randomUUID(),
        x: (x + 0.5) * TILE_SIZE,
        y: (y + 0.5) * TILE_SIZE,
        itemId: item,
        quantity: 1,
      });
    }
    for (const stack of chestDrops) {
      this.groundDrops.push({
        id: crypto.randomUUID(),
        x: (x + 0.5) * TILE_SIZE,
        y: (y + 0.5) * TILE_SIZE,
        ...stack,
      });
    }
    if (chest) {
      const index = this.chests.indexOf(chest);
      if (index >= 0) this.chests.splice(index, 1);
    }
    return this.finishMiningHit(true);
  }

  place(x: number, y: number): ActionResult {
    if (!this.withinReach(x, y)) return { ok: false, reason: "Cible hors de portée." };
    const stack = this.hotbar[this.selectedSlot];
    if (!stack) return { ok: false, reason: "L'emplacement sélectionné est vide." };
    if (isToolStack(stack)) return { ok: false, reason: "Les outils ne peuvent pas être posés comme blocs." };
    const plane = this.selectedPlane;
    if (!isBlockItem(stack.itemId) || !canPlaceItemOnPlane(stack.itemId, plane)) {
      return { ok: false, reason: `${ITEM_LABELS[stack.itemId]} ne peut pas être placé sur ce plan.` };
    }
    if (this.world.getBlockOnPlane(x, y, plane) !== Block.Air) {
      return { ok: false, reason: "Cette cellule est occupée sur ce plan." };
    }
    if (plane === "foreground" && overlapsPlayer(this.player, x, y)) {
      return { ok: false, reason: "Le personnage occupe cette cellule." };
    }
    const otherPlane = plane === "foreground" ? "background" : "foreground";
    const supported = this.world.getBlockOnPlane(x, y, otherPlane) !== Block.Air ||
      [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return Math.abs(nx) <= MAX_TILE_X && ny >= 0 && ny < WORLD_HEIGHT &&
          this.world.getBlockOnPlane(nx, ny, plane) !== Block.Air;
      });
    if (!supported) return { ok: false, reason: "Le bloc doit être accolé à un support." };
    const block = ITEM_BLOCKS[stack.itemId];
    if (this.world.editCount >= MAX_EDITS &&
        this.world.wouldAddEdit(x, y, block, this.selectedRotation, plane, true)) {
      return { ok: false, reason: "Limite du prototype atteinte : 100 000 blocs modifiés." };
    }
    this.world.setBlockOnPlane(x, y, block, this.selectedRotation, plane, true);
    this.damage.delete(damageKey(x, y, plane));
    const chestItem = chestItemForBlock(block);
    if (chestItem) {
      this.chests.push({
        x, y, itemId: chestItem,
        slots: Array.from({ length: CHEST_CAPACITY[chestItem] }, () => null),
      });
    }
    stack.quantity--;
    if (stack.quantity === 0) this.hotbar[this.selectedSlot] = null;
    return { ok: true };
  }

  snapshot(now = Date.now()): SaveGame {
    return {
      ...this.header,
      updatedAt: Math.max(now, this.header.updatedAt),
      tick: this.tick,
      player: { ...this.player },
      inventory: cloneInventory(this.inventory),
      hotbar: this.hotbar.map((stack) => stack ? { ...stack } : null),
      hotbarPlanes: [...this.hotbarPlanes],
      selectedSlot: this.selectedSlot,
      crafting: this.crafting ? { ...this.crafting } : null,
      difficulty: this.difficulty,
      survival: {
        ...this.survival,
        spawnPoint: { ...this.survival.spawnPoint },
        initialSpawnPoint: { ...this.survival.initialSpawnPoint },
        respawnBed: this.survival.respawnBed ? { ...this.survival.respawnBed } : null,
      },
      zombies: this.zombies.map((zombie) => ({ ...zombie })),
      nightWave: { ...this.nightWave },
      chests: this.chests.map((chest) => ({
        ...chest, slots: chest.slots.map((stack) => stack ? { ...stack } : null),
      })),
      edits: this.world.edits,
      backgroundEdits: this.world.backgroundEdits,
      groundDrops: this.groundDrops.map((drop) => ({ ...drop })),
      collectedNaturalPickups: [...this.collectedNaturalPickups].sort(),
      collectedPlants: [...this.collectedPlants].sort(),
      blockDamage: Array.from(this.damage.values(), (entry) => ({ ...entry })),
      creativeMode: this.creative,
      lightingQuality: this.lightingQuality,
    };
  }
}
