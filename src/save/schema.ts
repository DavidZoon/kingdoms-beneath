import { MAX_EDITS, MAX_GROUND_DROPS, MAX_STACK } from "../game/GameSession";
import {
  addItems, emptyInventory, getStacks, HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, STACK_SIZE, isToolStack, type ItemStack,
} from "../inventory/Inventory";
import { isRecipeId, RECIPES, validCraftQuantity, type CraftJob } from "../crafting/Recipes";
import { PLAYER_HEIGHT, PLAYER_WIDTH, playerOverlapsSolid } from "../player/PlayerController";
import {
  Block, BLOCKS, MAX_TILE_X, TILE_SIZE, WORLD_HEIGHT, TOOLS, canPlaceItemOnPlane, canUseItemOnPlane, isBlockId, isToolItem,
  isConstructionPlane, isItemId, isRotation, itemForBlock, type ConstructionPlane, type Inventory, type ItemId,
} from "../world/blocks";
import { WorldModel, cellKey, type TileEdit } from "../world/WorldModel";
import { isLightingQuality } from "../lighting/quality";
import type { BlockDamage, GroundDrop, SaveGame } from "./types";

export const MAX_SAVE_BYTES = 10 * 1024 * 1024;

export class SaveValidationError extends Error {
  override name = "SaveValidationError";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return finite(value, min, max) && Number.isSafeInteger(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function itemAvailableInVersion(itemId: ItemId, version: unknown): boolean {
  if (isToolItem(itemId)) return version === 8;
  if (itemId === "woodStairs" || itemId === "stoneStairs") return integer(version, 5, 8);
  if (itemId === "torch") return integer(version, 4, 8);
  return true;
}

function validateStack(value: unknown, hasTools: boolean, hasRotations: boolean, location = "objet"): ItemStack {
  if (!record(value) || !isItemId(value.itemId) || !integer(value.quantity, 1, STACK_SIZE)) {
    throw new SaveValidationError(location === "objet" ? "Pile d'objet invalide." : `Pile de ${location} invalide.`);
  }
  if (isToolItem(value.itemId)) {
    if (!hasTools || value.quantity !== 1 ||
        !integer(value.durability, 1, TOOLS[value.itemId].maxDurability) ||
        (value.rotation !== undefined && value.rotation !== 0)) {
      throw new SaveValidationError("Quantité, durabilité ou rotation d'outil invalide.");
    }
    return { itemId: value.itemId, quantity: 1, durability: value.durability };
  }
  const rotation = hasRotations && value.rotation !== undefined ? value.rotation : 0;
  if (!isRotation(rotation) || value.durability !== undefined) {
    throw new SaveValidationError("Rotation ou durabilité de pile invalide.");
  }
  return { itemId: value.itemId, quantity: value.quantity, ...(rotation !== 0 ? { rotation } : {}) };
}

export function validateSave(value: unknown): SaveGame {
  if (!record(value) || value.format !== "kingdoms-beneath") {
    throw new SaveValidationError("Ce fichier n'est pas une sauvegarde Kingdoms Beneath.");
  }
  const legacy = value.schemaVersion === 1 && value.generatorVersion === 1;
  const current = (value.schemaVersion === 2 || value.schemaVersion === 3 ||
    value.schemaVersion === 4 || value.schemaVersion === 5 || value.schemaVersion === 6 ||
    value.schemaVersion === 7 || value.schemaVersion === 8) &&
    (value.generatorVersion === 1 || value.generatorVersion === 2 ||
      ((value.schemaVersion === 7 || value.schemaVersion === 8) && value.generatorVersion === 3));
  if (!legacy && !current) {
    throw new SaveValidationError("Version de sauvegarde ou de générateur non prise en charge.");
  }
  const hasTools = value.schemaVersion === 8;
  const hasLayers = value.schemaVersion === 7 || hasTools;
  const hasRotations = value.schemaVersion === 6 || hasLayers;
  const hasHotbar = value.schemaVersion === 5 || hasRotations;
  const hasLighting = value.schemaVersion === 4 || hasHotbar;
  if (!text(value.id, 80) || !/^[a-zA-Z0-9-]+$/.test(value.id) ||
      !text(value.name, 60) || !text(value.seed, 100) ||
      !integer(value.createdAt, 0, 8_640_000_000_000_000) ||
      !integer(value.updatedAt, value.createdAt, 8_640_000_000_000_000) ||
      !integer(value.tick, 0, Number.MAX_SAFE_INTEGER) ||
      (!hasHotbar && (!isItemId(value.selectedItem) ||
        !itemAvailableInVersion(value.selectedItem, value.schemaVersion) ||
        (legacy && value.selectedItem === "ladder")))) {
    throw new SaveValidationError("Métadonnées de sauvegarde invalides.");
  }
  const player = value.player;
  if (!record(player)) throw new SaveValidationError("État du joueur invalide.");
  const playerX = player.x;
  const playerY = player.y;
  const playerVx = player.vx;
  const playerVy = player.vy;
  const grounded = player.grounded;
  const climbing = legacy && player.climbing === undefined ? false : player.climbing;
  if (!finite(playerX, -MAX_TILE_X * TILE_SIZE, MAX_TILE_X * TILE_SIZE - PLAYER_WIDTH) ||
      !finite(playerY, 0, (WORLD_HEIGHT - 1) * TILE_SIZE - PLAYER_HEIGHT) ||
      !finite(playerVx, -135, 135) || !finite(playerVy, -245, 400) ||
      typeof grounded !== "boolean" || typeof climbing !== "boolean") {
    throw new SaveValidationError("État du joueur invalide.");
  }
  const inventory = value.inventory;
  if (!record(inventory)) throw new SaveValidationError("Inventaire de sauvegarde invalide.");
  const dirt = inventory.dirt;
  const stone = inventory.stone;
  const wood = inventory.wood;
  const ladder = inventory.ladder;
  const torch = inventory.torch;
  const woodStairs = inventory.woodStairs;
  const stoneStairs = inventory.stoneStairs;
  if (!integer(dirt, 0, legacy ? 9999 : MAX_STACK) ||
      !integer(stone, 0, legacy ? 9999 : MAX_STACK) ||
      !integer(wood, 0, legacy ? 9999 : MAX_STACK) ||
      (legacy ? (ladder !== undefined && !integer(ladder, 0, MAX_STACK)) :
        !integer(ladder, 0, MAX_STACK)) ||
      (hasLighting && !integer(torch, 0, MAX_STACK)) ||
      (hasHotbar &&
        (!integer(woodStairs, 0, MAX_STACK) || !integer(stoneStairs, 0, MAX_STACK)))) {
    throw new SaveValidationError("Inventaire de sauvegarde invalide.");
  }
  const validatedInventory: Inventory = legacy
    ? emptyInventory()
    : {
      dirt,
      stone,
      wood,
      ladder: !legacy && typeof ladder === "number" ? ladder : 0,
      torch: hasLighting && typeof torch === "number" ? torch : 0,
      woodStairs: hasHotbar && typeof woodStairs === "number" ? woodStairs : 0,
      stoneStairs: hasHotbar && typeof stoneStairs === "number" ? stoneStairs : 0,
      tools: [],
    };
  if (hasTools) {
    if (!Array.isArray(inventory.tools) || inventory.tools.length > INVENTORY_SLOT_COUNT) {
      throw new SaveValidationError("Liste d'outils de l'inventaire invalide.");
    }
    validatedInventory.tools = inventory.tools.map((entry: unknown) => {
      const stack = validateStack(entry, true, false);
      if (!isToolStack(stack)) throw new SaveValidationError("Objet non outil dans la catégorie Outils.");
      return stack;
    });
  } else if (inventory.tools !== undefined &&
      (!Array.isArray(inventory.tools) || inventory.tools.length !== 0)) {
    throw new SaveValidationError("Les outils nécessitent une sauvegarde de version 8.");
  }
  const migratedDrops: GroundDrop[] = [];
  if (legacy) {
    for (const itemId of ["dirt", "stone", "wood"] as const) {
      const count = itemId === "dirt" ? dirt : itemId === "stone" ? stone : wood;
      const accepted = addItems(validatedInventory, itemId, count);
      for (let remaining = count - accepted, index = 0; remaining > 0; remaining -= STACK_SIZE, index++) {
        migratedDrops.push({
          id: `legacy-${itemId}-${index}`,
          x: Math.min(MAX_TILE_X * TILE_SIZE, playerX + PLAYER_WIDTH / 2 + TILE_SIZE * 2),
          y: playerY + PLAYER_HEIGHT / 2,
          itemId,
          quantity: Math.min(remaining, STACK_SIZE),
        });
      }
    }
  }
  if (getStacks(validatedInventory).length > INVENTORY_SLOT_COUNT) {
    throw new SaveValidationError("L'inventaire dépasse ses 24 emplacements.");
  }
  let hotbar: Array<ItemStack | null>;
  let selectedSlot: number;
  let crafting: CraftJob | null = null;
  if (hasHotbar) {
    if (!Array.isArray(value.hotbar) || value.hotbar.length !== HOTBAR_SLOT_COUNT ||
        !integer(value.selectedSlot, 0, HOTBAR_SLOT_COUNT - 1)) {
      throw new SaveValidationError("Barre de raccourcis invalide.");
    }
    hotbar = value.hotbar.map((stack: unknown) => {
      if (stack === null) return null;
      return validateStack(stack, hasTools, hasRotations, "raccourci");
    });
    selectedSlot = value.selectedSlot;
    if (value.crafting !== null) {
      const job = value.crafting;
      if (!record(job) || !isRecipeId(job.recipeId) ||
          (!hasTools && job.recipeId === "stonePickaxe") ||
          typeof job.quantity !== "number" || !validCraftQuantity(RECIPES[job.recipeId], job.quantity) ||
          !integer(job.completed, 0, job.quantity - 1) ||
          !integer(job.progressTicks, 0, RECIPES[job.recipeId].ticksPerItem)) {
        throw new SaveValidationError("Fabrication en cours invalide.");
      }
      crafting = {
        recipeId: job.recipeId, quantity: job.quantity,
        completed: job.completed, progressTicks: job.progressTicks,
      };
    }
  } else {
    const oldItems = ["dirt", "stone", "wood", "ladder", "torch"] as const;
    if (!isItemId(value.selectedItem)) throw new SaveValidationError("Sélection invalide.");
    selectedSlot = oldItems.findIndex((item) => item === value.selectedItem);
    if (selectedSlot < 0) throw new SaveValidationError("Sélection invalide.");
    hotbar = Array.from({ length: HOTBAR_SLOT_COUNT }, () => null);
    oldItems.forEach((itemId, index) => {
      const quantity = Math.min(validatedInventory[itemId], STACK_SIZE);
      if (quantity > 0) {
        hotbar[index] = { itemId, quantity };
        validatedInventory[itemId] -= quantity;
      }
    });
  }
  const rawPlanes = hasLayers ? value.hotbarPlanes : Array(HOTBAR_SLOT_COUNT).fill("foreground");
  if (!Array.isArray(rawPlanes) || rawPlanes.length !== HOTBAR_SLOT_COUNT) {
    throw new SaveValidationError("Plans des raccourcis invalides.");
  }
  const hotbarPlanes: ConstructionPlane[] = rawPlanes.map((plane: unknown, index: number) => {
    if (!isConstructionPlane(plane) || (hotbar[index] && !canUseItemOnPlane(hotbar[index].itemId, plane))) {
      throw new SaveValidationError("Plan de raccourci invalide pour cet objet.");
    }
    return plane;
  });
  const rawDrops = legacy ? migratedDrops : value.groundDrops;
  if (!Array.isArray(rawDrops) || rawDrops.length > MAX_GROUND_DROPS) {
    throw new SaveValidationError("Liste d'objets déposés invalide ou trop volumineuse.");
  }
  const dropIds = new Set<string>();
  const groundDrops: GroundDrop[] = rawDrops.map((drop: unknown) => {
    if (!record(drop) || !text(drop.id, 80) || !/^[a-zA-Z0-9-]+$/.test(drop.id) ||
        dropIds.has(drop.id) ||
        !finite(drop.x, -MAX_TILE_X * TILE_SIZE, MAX_TILE_X * TILE_SIZE) ||
        !finite(drop.y, 0, (WORLD_HEIGHT - 1) * TILE_SIZE) ||
        !isItemId(drop.itemId) || !itemAvailableInVersion(drop.itemId, value.schemaVersion) ||
        !integer(drop.quantity, 1, STACK_SIZE)) {
      throw new SaveValidationError("Objet déposé invalide.");
    }
    dropIds.add(drop.id);
    return { ...validateStack(drop, hasTools, false), id: drop.id, x: drop.x, y: drop.y };
  });
  if (!Array.isArray(value.edits) || value.edits.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de modifications invalide ou trop volumineuse.");
  }
  const seen = new Set<string>();
  const edits: TileEdit[] = value.edits.map((edit: unknown) => {
    if (!record(edit) || !integer(edit.x, -MAX_TILE_X, MAX_TILE_X) ||
        !integer(edit.y, 0, WORLD_HEIGHT - 2) || !isBlockId(edit.block) ||
        edit.block === Block.Bedrock ||
        (!hasLighting && edit.block === Block.Torch) ||
        (!hasHotbar && (edit.block === Block.WoodStairs || edit.block === Block.StoneStairs))) {
      throw new SaveValidationError("Modification de terrain invalide.");
    }
    const key = cellKey(edit.x, edit.y);
    if (seen.has(key)) throw new SaveValidationError("La sauvegarde contient des cellules dupliquées.");
    seen.add(key);
    const rotation = hasRotations && edit.rotation !== undefined ? edit.rotation : 0;
    if (!isRotation(rotation) || (edit.block === Block.Air && rotation !== 0)) {
      throw new SaveValidationError("Rotation de terrain invalide.");
    }
    return { x: edit.x, y: edit.y, block: edit.block, ...(rotation !== 0 ? { rotation } : {}) };
  });
  const generatorVersion = value.generatorVersion === 1 ? 1 : value.generatorVersion === 2 ? 2 : 3;
  const generatedWorld = new WorldModel(value.seed, edits, generatorVersion);
  const rawBackgroundEdits = hasLayers ? value.backgroundEdits : [];
  if (!Array.isArray(rawBackgroundEdits) || edits.length + rawBackgroundEdits.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de modifications d'arrière-plan invalide ou trop volumineuse.");
  }
  const backgroundCells = new Set<string>();
  const backgroundEdits: TileEdit[] = rawBackgroundEdits.map((edit: unknown) => {
    if (!record(edit) || !integer(edit.x, -MAX_TILE_X, MAX_TILE_X) ||
        !integer(edit.y, 0, WORLD_HEIGHT - 2) || !isBlockId(edit.block)) {
      throw new SaveValidationError("Modification d'arrière-plan invalide.");
    }
    const key = cellKey(edit.x, edit.y);
    const item = itemForBlock(edit.block);
    const trunk = generatedWorld.generator.isBackgroundTrunk(edit.x, edit.y);
    if (backgroundCells.has(key) || generatedWorld.generator.isImmutableBackground(edit.x, edit.y) ||
        (edit.block === Block.Air ? !trunk : !item || !canPlaceItemOnPlane(item, "background"))) {
      throw new SaveValidationError("Modification d'arrière-plan invalide ou cellule dupliquée.");
    }
    const rotation = edit.rotation === undefined ? 0 : edit.rotation;
    if (!isRotation(rotation) || (edit.block === Block.Air && rotation !== 0)) {
      throw new SaveValidationError("Rotation d'arrière-plan invalide.");
    }
    backgroundCells.add(key);
    return { x: edit.x, y: edit.y, block: edit.block, ...(rotation !== 0 ? { rotation } : {}) };
  });
  const hasCreativeState = value.schemaVersion === 3 || hasLighting;
  const creativeMode = hasCreativeState ? value.creativeMode : false;
  if (typeof creativeMode !== "boolean") {
    throw new SaveValidationError("Option Mode créatif invalide.");
  }
  const rawDamage = hasCreativeState ? value.blockDamage : [];
  if (!Array.isArray(rawDamage) || rawDamage.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de durabilité invalide ou trop volumineuse.");
  }
  const world = new WorldModel(value.seed, edits, generatorVersion, backgroundEdits);
  const damagedCells = new Set<string>();
  const blockDamage: BlockDamage[] = rawDamage.map((entry: unknown) => {
    if (!record(entry) || !integer(entry.x, -MAX_TILE_X, MAX_TILE_X) ||
        !integer(entry.y, 0, WORLD_HEIGHT - 2) || !integer(entry.damage, 1, Number.MAX_SAFE_INTEGER)) {
      throw new SaveValidationError("Durabilité de bloc invalide.");
    }
    const plane = hasLayers ? entry.plane : "foreground";
    if (!isConstructionPlane(plane)) throw new SaveValidationError("Plan de durabilité invalide.");
    const key = `${plane}:${cellKey(entry.x, entry.y)}`;
    const durability = BLOCKS[world.getBlockOnPlane(entry.x, entry.y, plane)].durability;
    if (damagedCells.has(key) || durability === null || entry.damage >= durability ||
        (plane === "background" && world.getBackgroundOrigin(entry.x, entry.y) === "natural")) {
      throw new SaveValidationError("Durabilité de bloc invalide ou cellule dupliquée.");
    }
    damagedCells.add(key);
    return { x: entry.x, y: entry.y, damage: entry.damage, plane };
  });
  const lightingQuality = hasLighting ? value.lightingQuality : "standard";
  if (!isLightingQuality(lightingQuality)) throw new SaveValidationError("Qualité d'éclairage invalide.");
  const result: SaveGame = {
    format: "kingdoms-beneath", schemaVersion: 8, generatorVersion,
    id: value.id, name: value.name, seed: value.seed,
    createdAt: value.createdAt, updatedAt: value.updatedAt, tick: value.tick,
    player: {
      x: playerX, y: playerY, vx: playerVx, vy: playerVy,
      grounded, climbing,
    },
    inventory: validatedInventory,
    hotbar, hotbarPlanes, selectedSlot, crafting, edits, backgroundEdits,
    groundDrops, creativeMode, blockDamage, lightingQuality,
  };
  if (playerOverlapsSolid(world, result.player)) {
    throw new SaveValidationError("Le joueur est bloqué dans un bloc solide.");
  }
  return result;
}

export function parseSave(source: string): SaveGame {
  if (new TextEncoder().encode(source).byteLength > MAX_SAVE_BYTES) {
    throw new SaveValidationError("Le fichier dépasse la limite de 10 Mo.");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new SaveValidationError("Le fichier n'est pas un document JSON valide.", { cause: error });
  }
  return validateSave(value);
}

export function serializeSave(save: SaveGame): string {
  const source = `${JSON.stringify(validateSave(save), null, 2)}\n`;
  if (new TextEncoder().encode(source).byteLength > MAX_SAVE_BYTES) {
    throw new SaveValidationError("La sauvegarde dépasse la limite d'export de 10 Mo.");
  }
  return source;
}
