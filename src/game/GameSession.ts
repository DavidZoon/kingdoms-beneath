import {
  PLAYER_HEIGHT, PLAYER_WIDTH, overlapsPlayer, stepPlayer,
  type MovementInput, type PlayerState,
} from "../player/PlayerController";
import type { BlockDamage, GroundDrop, SaveGame } from "../save/types";
import {
  addItems, availableItemSpace, emptyInventory, getStacks, HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT,
  ITEM_CAPACITY, STACK_SIZE, cloneInventory, isToolStack, removeInventoryStack, type ItemStack,
} from "../inventory/Inventory";
import {
  isRecipeId, RECIPES, requiredMaterials, validCraftQuantity, type CraftJob, type RecipeId,
} from "../crafting/Recipes";
import {
  Block, BLOCKS, ITEM_BLOCKS, ITEM_LABELS, MAX_TILE_X, TILE_SIZE, WORLD_HEIGHT,
  ITEM_PLANES, TOOLS, canPlaceItemOnPlane, canUseItemOnPlane, isConstructionPlane, isItemId, isToolItem, rotateQuarterTurn,
  type ConstructionPlane, type Inventory, type ItemId, type Rotation,
} from "../world/blocks";
import { cellKey, WorldModel } from "../world/WorldModel";
import type { LightingQuality } from "../lighting/quality";

export const MAX_STACK = ITEM_CAPACITY;
export const MAX_EDITS = 100_000;
export const MAX_GROUND_DROPS = 10_000;
const PICKUP_RANGE = 24;
const damageKey = (x: number, y: number, plane: ConstructionPlane): string => `${plane}:${cellKey(x, y)}`;
export type ActionResult = { ok: true } | { ok: false; reason: string };
export type MiningResult =
  | { ok: true; destroyed: boolean; toolBroken?: boolean }
  | { ok: false; reason: string }
  | { ok: false; silent: true };
export type ResourceGrantResult = { ok: true; added: number } | { ok: false; reason: string };

export class GameSession {
  readonly world: WorldModel;
  readonly player: PlayerState;
  readonly inventory: Inventory;
  readonly hotbar: Array<ItemStack | null>;
  readonly hotbarPlanes: ConstructionPlane[];
  readonly groundDrops: GroundDrop[];
  selectedSlot: number;
  crafting: CraftJob | null;
  tick: number;
  lightingQuality: LightingQuality;
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
    this.selectedSlot = save.selectedSlot;
    this.crafting = save.crafting ? { ...save.crafting } : null;
    this.tick = save.tick;
    this.lightingQuality = save.lightingQuality;
    this.creative = save.creativeMode;
    for (const entry of save.blockDamage) this.damage.set(damageKey(entry.x, entry.y, entry.plane), { ...entry });
  }

  static create(name: string, seed: string, now = Date.now()): GameSession {
    const world = new WorldModel(seed, [], 3);
    return new GameSession({
      format: "kingdoms-beneath",
      schemaVersion: 8,
      generatorVersion: 3,
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
        { itemId: "dirt", quantity: 12 }, null, { itemId: "wood", quantity: 24 },
        { itemId: "ladder", quantity: 6 }, { itemId: "torch", quantity: 4 },
        null, null, null, null, null,
      ],
      hotbarPlanes: Array.from({ length: HOTBAR_SLOT_COUNT }, () => "foreground"),
      selectedSlot: 2,
      crafting: null,
      edits: [],
      backgroundEdits: [],
      groundDrops: [],
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
    if (stack && !canUseItemOnPlane(stack.itemId, plane)) {
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

  grantResources(itemId: ItemId, quantity: number): ResourceGrantResult {
    if (!this.creative) return { ok: false, reason: "Activez le Mode créatif dans les options de la partie." };
    if (!isItemId(itemId) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > ITEM_CAPACITY) {
      return { ok: false, reason: `Choisissez une ressource et une quantité entière entre 1 et ${ITEM_CAPACITY}.` };
    }
    const added = addItems(this.inventory, itemId, quantity);
    if (added === 0) return { ok: false, reason: "Inventaire plein : libérez un emplacement ou une pile." };
    return { ok: true, added };
  }

  startCraft(recipeId: RecipeId, quantity: number): ActionResult {
    if (this.crafting) return { ok: false, reason: "Une fabrication est déjà en cours." };
    if (!isRecipeId(recipeId)) return { ok: false, reason: "Recette inconnue." };
    const recipe = RECIPES[recipeId];
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

  step(input: MovementInput): void {
    stepPlayer(this.world, this.player, input);
    this.pickupNearby();
    this.advanceCraft();
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
  }

  dropSelectedItem(quantity = 1): ActionResult {
    const stack = this.hotbar[this.selectedSlot];
    if (!stack) return { ok: false, reason: "Aucune ressource à déposer." };
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return { ok: false, reason: "Quantité à déposer invalide." };
    }
    if (this.groundDrops.length >= MAX_GROUND_DROPS) {
      return { ok: false, reason: "Trop d'objets sont déjà déposés dans ce monde." };
    }
    const amount = Math.min(quantity, STACK_SIZE, stack.quantity);
    const dropped: ItemStack = isToolStack(stack) ? { ...stack } : { itemId: stack.itemId, quantity: amount };
    if (isToolStack(stack)) this.hotbar[this.selectedSlot] = null;
    else {
      stack.quantity -= amount;
      if (stack.quantity === 0) this.hotbar[this.selectedSlot] = null;
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

  mine(x: number, y: number, power = this.miningPower): MiningResult {
    if (!Number.isSafeInteger(power) || power <= 0) {
      return { ok: false, reason: "Puissance de minage invalide." };
    }
    if (!this.withinReach(x, y)) return { ok: false, reason: "Cible hors de portée." };
    const plane = this.selectedPlane;
    const block = this.world.getBlockOnPlane(x, y, plane);
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
    if (this.world.editCount >= MAX_EDITS && this.world.wouldAddEdit(x, y, Block.Air, 0, plane)) {
      return { ok: false, reason: "Limite du prototype atteinte : 100 000 blocs modifiés." };
    }
    if (drop && availableItemSpace(this.inventory, drop, this.hotbar) === 0 &&
        this.groundDrops.length >= MAX_GROUND_DROPS) {
      return { ok: false, reason: "Inventaire et espace de dépôt pleins." };
    }
    this.world.setBlockOnPlane(x, y, Block.Air, 0, plane);
    this.damage.delete(key);
    if (drop && addItems(this.inventory, drop, 1, this.hotbar) === 0) {
      this.groundDrops.push({
        id: crypto.randomUUID(),
        x: (x + 0.5) * TILE_SIZE,
        y: (y + 0.5) * TILE_SIZE,
        itemId: drop,
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
    if (!canPlaceItemOnPlane(stack.itemId, plane)) {
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
        this.world.wouldAddEdit(x, y, block, this.selectedRotation, plane)) {
      return { ok: false, reason: "Limite du prototype atteinte : 100 000 blocs modifiés." };
    }
    this.world.setBlockOnPlane(x, y, block, this.selectedRotation, plane);
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
      edits: this.world.edits,
      backgroundEdits: this.world.backgroundEdits,
      groundDrops: this.groundDrops.map((drop) => ({ ...drop })),
      blockDamage: Array.from(this.damage.values(), (entry) => ({ ...entry })),
      creativeMode: this.creative,
      lightingQuality: this.lightingQuality,
    };
  }
}
