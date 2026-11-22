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
import { isPlantItem, type PlantItemId } from "../world/resources";
import type { LightingQuality } from "../lighting/quality";
import { DIFFICULTIES, isDifficultyId, type DifficultyId } from "../survival/Difficulty";
import {
  PLAYER_MAX_HEALTH, RESPAWN_INVULNERABILITY_TICKS, RESPAWN_TICKS, type SurvivalState,
} from "../survival/SurvivalState";
import {
  spawnZombie, stepZombie, zombieOverlapsTile,
  type NightWaveState, type ZombieState,
} from "../entities/Zombie";
import { DAY_LENGTH_TICKS, dayPhaseAt } from "../lighting/WorldClock";

export const MAX_STACK = ITEM_CAPACITY;
export const MAX_EDITS = 100_000;
export const MAX_GROUND_DROPS = 10_000;
const PICKUP_RANGE = 24;
const STATION_RANGE = 4 * TILE_SIZE;
const damageKey = (x: number, y: number, plane: ConstructionPlane): string => `${plane}:${cellKey(x, y)}`;
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
  private readonly header: SaveGame;
  private readonly damage = new Map<string, BlockDamage>();
  private creative: boolean;

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
    this.survival = { ...save.survival, spawnPoint: { ...save.survival.spawnPoint } };
    this.zombies = save.zombies.map((zombie) => ({ ...zombie }));
    this.nightWave = { ...save.nightWave };
    this.creative = save.creativeMode;
    for (const entry of save.blockDamage) this.damage.set(damageKey(entry.x, entry.y, entry.plane), { ...entry });
  }

  static create(name: string, seed: string, now = Date.now()): GameSession {
    const world = new WorldModel(seed, [], 5);
    return new GameSession({
      format: "kingdoms-beneath",
      schemaVersion: 12,
      generatorVersion: 5,
      id: crypto.randomUUID(),
      name,
      seed,
      createdAt: now,
      updatedAt: now,
      tick: 0,
      player: {
        x: 8 * TILE_SIZE,
        y: world.generator.surfaceAt(8) * TILE_SIZE - PLAYER_HEIGHT,
        vx: 0, vy: 0, grounded: true, climbing: false,
      },
      inventory: emptyInventory(),
      hotbar: [
        { itemId: "dirt", quantity: 12 }, null, { itemId: "pine_log", quantity: 24 },
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
      },
      zombies: [],
      nightWave: { lastStartedDay: -1, pending: 0, nextSpawnTick: 0 },
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
    const added = addItems(this.inventory, itemId, quantity);
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
    if (availableItemSpace(next, recipe.output, hotbar) < quantity) {
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
    return !!job && job.progressTicks === RECIPES[job.recipeId].ticksPerItem &&
      availableItemSpace(this.inventory, RECIPES[job.recipeId].output, this.hotbar) === 0;
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
        addItems(this.inventory, recipe.output, 1, this.hotbar) !== 1) return;
    job.completed++;
    job.progressTicks = 0;
    if (job.completed === job.quantity) this.crafting = null;
  }

  getBlockDamage(x: number, y: number, plane: ConstructionPlane = "foreground"): number {
    return this.damage.get(damageKey(x, y, plane))?.damage ?? 0;
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

  private respawn(): void {
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
    let damage = 0;
    for (const zombie of this.zombies) {
      damage = Math.max(damage, stepZombie(this.world, zombie, this.player, DIFFICULTIES[this.difficulty]).damage);
    }
    if (damage > 0) this.takeDamage(damage);
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

  step(input: MovementInput): void {
    if (this.survival.invulnerabilityTicks > 0) this.survival.invulnerabilityTicks--;
    if (this.survival.dead) {
      this.survival.respawnTicks = Math.max(0, this.survival.respawnTicks - 1);
      if (this.survival.respawnTicks === 0) this.respawn();
      this.tick++;
      return;
    }

    stepPlayer(this.world, this.player, input);
    this.pickupNearby();
    this.advanceCraft();
    this.advanceNight();
    this.advanceEnemies();
    this.tick++;
  }

  private pickupNearby(): void {
    const centerX = this.player.x + PLAYER_WIDTH / 2;
    const centerY = this.player.y + PLAYER_HEIGHT / 2;
    for (let index = this.groundDrops.length - 1; index >= 0; index--) {
      const drop = this.groundDrops[index];
      if (Math.hypot(centerX - drop.x, centerY - drop.y) > PICKUP_RANGE) continue;
      const collected = addItems(this.inventory, drop.itemId, drop.quantity, this.hotbar, drop.durability);
      if (collected === drop.quantity) this.groundDrops.splice(index, 1);
      else if (!isToolStack(drop)) drop.quantity -= collected;
    }
    for (const drop of this.naturalPickups(
      Math.floor((centerX - PICKUP_RANGE) / TILE_SIZE), Math.ceil((centerX + PICKUP_RANGE) / TILE_SIZE),
      Math.floor((centerY - PICKUP_RANGE) / TILE_SIZE), Math.ceil((centerY + PICKUP_RANGE) / TILE_SIZE),
    )) {
      if (Math.hypot(centerX - drop.x, centerY - drop.y) > PICKUP_RANGE ||
          this.collectedNaturalPickups.size >= MAX_EDITS) continue;
      if (addItems(this.inventory, drop.itemId, 1, this.hotbar) === 1) this.collectedNaturalPickups.add(drop.id);
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

  private get miningPower(): number {
    const stack = this.hotbar[this.selectedSlot];
    return stack && isToolStack(stack) ? TOOLS[stack.itemId].miningPower : 1;
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
    if (addItems(this.inventory, plant.itemId, 1, this.hotbar) === 0) {
      this.groundDrops.push({
        id: crypto.randomUUID(), x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE,
        itemId: plant.itemId, quantity: 1,
      });
    }
    this.collectedPlants.add(plant.id);
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

  mine(targetX: number, targetY: number, power = this.miningPower): MiningResult {
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
    const harvests = this.world.naturalHarvestAt(x, y, plane).filter((item) => !isPlantItem(item));
    const rewards = [...(drop ? [drop] : []), ...harvests];
    if (this.world.editCount >= MAX_EDITS && this.world.wouldAddEdit(x, y, Block.Air, 0, plane)) {
      return { ok: false, reason: "Limite du prototype atteinte : 100 000 blocs modifiés." };
    }
    const nextInventory = cloneInventory(this.inventory);
    const nextHotbar = this.hotbar.map((stack) => stack ? { ...stack } : null);
    const overflow = rewards.filter((item) => addItems(nextInventory, item, 1, nextHotbar) === 0);
    if (this.groundDrops.length + overflow.length > MAX_GROUND_DROPS) {
      return { ok: false, reason: "Inventaire et espace de dépôt pleins." };
    }
    this.world.setBlockOnPlane(x, y, Block.Air, 0, plane);
    this.damage.delete(key);
    Object.assign(this.inventory, nextInventory);
    this.hotbar.forEach((stack, index) => {
      const next = nextHotbar[index];
      if (stack && next) stack.quantity = next.quantity;
    });
    for (const item of overflow) {
      this.groundDrops.push({
        id: crypto.randomUUID(),
        x: (x + 0.5) * TILE_SIZE,
        y: (y + 0.5) * TILE_SIZE,
        itemId: item,
        quantity: 1,
      });
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
      survival: { ...this.survival, spawnPoint: { ...this.survival.spawnPoint } },
      zombies: this.zombies.map((zombie) => ({ ...zombie })),
      nightWave: { ...this.nightWave },
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
