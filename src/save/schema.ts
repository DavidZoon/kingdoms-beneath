import { MAX_EDITS, MAX_GROUND_DROPS, MAX_STACK } from "../game/GameSession";
import {
  addItems, emptyInventory, getStacks, HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, STACK_SIZE, isToolStack, type ItemStack,
} from "../inventory/Inventory";
import { isRecipeId, RECIPES, validCraftQuantity, type CraftJob } from "../crafting/Recipes";
import { PLAYER_HEIGHT, PLAYER_WIDTH, playerOverlapsSolid } from "../player/PlayerController";
import {
  Block, BLOCKS, MATERIAL_ITEMS, MAX_TILE_X, TILE_SIZE, WORLD_HEIGHT, TOOLS, canPlaceItemOnPlane, canUseItemOnPlane, isBlockId, isToolItem,
  isConstructionPlane, isItemId, isRotation, itemForBlock, type ConstructionPlane, type Inventory, type ItemId,
} from "../world/blocks";
import { WorldModel, cellKey, type TileEdit } from "../world/WorldModel";
import { PLANT_ITEMS } from "../world/resources";
import { isLightingQuality } from "../lighting/quality";
import type { BlockDamage, GroundDrop, SaveGame } from "./types";
import { DIFFICULTIES, isDifficultyId } from "../survival/Difficulty";
import {
  PLAYER_MAX_HEALTH, RESPAWN_INVULNERABILITY_TICKS, RESPAWN_TICKS, type SurvivalState,
} from "../survival/SurvivalState";
import {
  ZOMBIE_ATTACK_COOLDOWN, ZOMBIE_DIG_COOLDOWN, ZOMBIE_MAX_HEALTH, ZOMBIE_HEIGHT, ZOMBIE_WIDTH,
  zombieOverlapsSolid, type NightWaveState, type ZombieState,
} from "../entities/Zombie";
import { CHEST_CAPACITY, CHEST_ITEMS, CHEST_BLOCKS, type ChestState } from "../inventory/Chest";

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
  if (itemId === "apple" || itemId === "pear" || itemId === "peach" || itemId === "apricot") {
    return integer(version, 17, 18);
  }
  if (itemId === "smallChest" || itemId === "mediumChest" || itemId === "largeChest") return integer(version, 16, 18);
  if (itemId === "woodSpikes" || itemId === "ironSpikes") return integer(version, 15, 18);
  if (itemId === "bed") return integer(version, 14, 18);
  if (itemId === "woodPickaxe") return integer(version, 14, 18);
  if (itemId === "woodSword" || itemId === "copperSword" || itemId === "ironSword") return integer(version, 13, 18);
  if (itemId === "copperPickaxe" || itemId === "ironPickaxe") return integer(version, 11, 18);
  if (itemId === "workbench" || itemId === "furnace" || itemId === "forge" ||
      itemId === "copper_ingot" || itemId === "iron_ingot") return integer(version, 11, 18);
  if (isToolItem(itemId)) return integer(version, 8, 18);
  if (itemId === "woodStairs" || itemId === "stoneStairs") return integer(version, 5, 18);
  if (itemId === "torch") return integer(version, 4, 18);
  return ["dirt", "stone", "pine_log", "ladder"].includes(itemId) || integer(version, 9, 18);
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
  if (record(value) && integer(value.schemaVersion, 1, 12) && Array.isArray(value.hotbar)) {
    value = {
      ...value,
      hotbar: value.hotbar.map((stack) =>
        record(stack) && stack.itemId === "woodSword" ? null : stack),
    };
  }
  if (record(value) && integer(value.schemaVersion, 1, 8)) {
    const migrateStack = (stack: unknown): unknown =>
      record(stack) && stack.itemId === "wood" ? { ...stack, itemId: "pine_log" } : stack;
    value = {
      ...value,
      inventory: record(value.inventory) ? {
        ...value.inventory, pine_log: value.inventory.pine_log ?? value.inventory.wood,
      } : value.inventory,
      selectedItem: value.selectedItem === "wood" ? "pine_log" : value.selectedItem,
      hotbar: Array.isArray(value.hotbar) ? value.hotbar.map(migrateStack) : value.hotbar,
      groundDrops: Array.isArray(value.groundDrops) ? value.groundDrops.map(migrateStack) : value.groundDrops,
    };
  }
  if (!record(value) || value.format !== "kingdoms-beneath") {
    throw new SaveValidationError("Ce fichier n'est pas une sauvegarde Kingdoms Beneath.");
  }
  const legacy = value.schemaVersion === 1 && value.generatorVersion === 1;
  const current = (value.schemaVersion === 2 || value.schemaVersion === 3 ||
    value.schemaVersion === 4 || value.schemaVersion === 5 || value.schemaVersion === 6 ||
    value.schemaVersion === 7 || value.schemaVersion === 8 || value.schemaVersion === 9 ||
    value.schemaVersion === 10 || value.schemaVersion === 11 || value.schemaVersion === 12 ||
    value.schemaVersion === 13 || value.schemaVersion === 14 || value.schemaVersion === 15 ||
    value.schemaVersion === 16 || value.schemaVersion === 17 || value.schemaVersion === 18) &&
    (value.generatorVersion === 1 || value.generatorVersion === 2 ||
      (integer(value.schemaVersion, 7, 18) && value.generatorVersion === 3) ||
      (integer(value.schemaVersion, 9, 18) && value.generatorVersion === 4) ||
      (integer(value.schemaVersion, 10, 18) && value.generatorVersion === 5) ||
      (integer(value.schemaVersion, 13, 18) && value.generatorVersion === 6) ||
      (integer(value.schemaVersion, 17, 18) && value.generatorVersion === 7) ||
      (value.schemaVersion === 18 && value.generatorVersion === 8));
  if (!legacy && !current) {
    throw new SaveValidationError("Version de sauvegarde ou de générateur non prise en charge.");
  }
  const hasFruits = integer(value.schemaVersion, 17, 18);
  const hasTraps = integer(value.schemaVersion, 15, 18);
  const hasChests = integer(value.schemaVersion, 16, 18);
  const hasBed = integer(value.schemaVersion, 14, 18);
  const hasSurvival = integer(value.schemaVersion, 12, 18);
  const hasAdvancedCrafting = integer(value.schemaVersion, 11, 18);
  const hasCombatWeapons = integer(value.schemaVersion, 13, 18);
  const hasResources = integer(value.schemaVersion, 9, 18);
  const hasTools = value.schemaVersion === 8 || hasResources;
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
  const facing = player.facing ?? 1;
  if (!finite(playerX, -MAX_TILE_X * TILE_SIZE, MAX_TILE_X * TILE_SIZE - PLAYER_WIDTH) ||
      !finite(playerY, 0, (WORLD_HEIGHT - 1) * TILE_SIZE - PLAYER_HEIGHT) ||
      !finite(playerVx, -135, 135) || !finite(playerVy, -245, 400) ||
      typeof grounded !== "boolean" || typeof climbing !== "boolean" ||
      (facing !== -1 && facing !== 1) ||
      (hasCombatWeapons && player.facing === undefined)) {
    throw new SaveValidationError("État du joueur invalide.");
  }
  const inventory = value.inventory;
  if (!record(inventory)) throw new SaveValidationError("Inventaire de sauvegarde invalide.");
  const dirt = inventory.dirt;
  const stone = inventory.stone;
  const pine_log = inventory.pine_log;
  const ladder = inventory.ladder;
  const torch = inventory.torch;
  const woodStairs = inventory.woodStairs;
  const stoneStairs = inventory.stoneStairs;
  if (!integer(dirt, 0, legacy ? 9999 : MAX_STACK) ||
      !integer(stone, 0, legacy ? 9999 : MAX_STACK) ||
      !integer(pine_log, 0, legacy ? 9999 : MAX_STACK) ||
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
      ...emptyInventory(),
      dirt,
      stone,
      pine_log,
      ladder: !legacy && typeof ladder === "number" ? ladder : 0,
      torch: hasLighting && typeof torch === "number" ? torch : 0,
      woodStairs: hasHotbar && typeof woodStairs === "number" ? woodStairs : 0,
      stoneStairs: hasHotbar && typeof stoneStairs === "number" ? stoneStairs : 0,
      tools: [],
    };
  if (hasResources) {
    for (const item of MATERIAL_ITEMS) {
      const advancedItem = item === "workbench" || item === "furnace" || item === "forge" ||
        item === "copper_ingot" || item === "iron_ingot";
      const missingNewItem = (advancedItem && !hasAdvancedCrafting) ||
        (item === "bed" && !hasBed) ||
        ((item === "woodSpikes" || item === "ironSpikes") && !hasTraps) ||
        ((item === "smallChest" || item === "mediumChest" || item === "largeChest") && !hasChests) ||
        ((item === "apple" || item === "pear" || item === "peach" || item === "apricot") && !hasFruits);
      const quantity = missingNewItem ? 0 : inventory[item];
      if (!integer(quantity, 0, MAX_STACK)) throw new SaveValidationError(`Quantité de ${item} invalide.`);
      validatedInventory[item] = quantity;
    }
  }
  if (hasTools) {
    if (!Array.isArray(inventory.tools) || inventory.tools.length > INVENTORY_SLOT_COUNT) {
      throw new SaveValidationError("Liste d'outils de l'inventaire invalide.");
    }
    validatedInventory.tools = inventory.tools.map((entry: unknown) => {
      const stack = validateStack(entry, true, false);
      if (!isToolStack(stack) || !itemAvailableInVersion(stack.itemId, value.schemaVersion)) {
        throw new SaveValidationError("Outil incompatible avec la version ou objet non outil dans la catégorie Outils.");
      }
      return stack;
    });
  } else if (inventory.tools !== undefined &&
      (!Array.isArray(inventory.tools) || inventory.tools.length !== 0)) {
    throw new SaveValidationError("Les outils nécessitent une sauvegarde de version 8.");
  }
  const migratedDrops: GroundDrop[] = [];
  if (legacy) {
    for (const itemId of ["dirt", "stone", "pine_log"] as const) {
      const count = itemId === "dirt" ? dirt : itemId === "stone" ? stone : pine_log;
      const accepted = addItems(validatedInventory, itemId, count);
      for (let remaining = count - accepted, index = 0; remaining > 0; remaining -= STACK_SIZE, index++) {
        migratedDrops.push({
          id: `legacy-${itemId.replaceAll("_", "-")}-${index}`,
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
      const validated = validateStack(stack, hasTools, hasRotations, "raccourci");
      if (!itemAvailableInVersion(validated.itemId, value.schemaVersion)) throw new SaveValidationError("Objet de raccourci incompatible avec la version.");
      return validated;
    });
    selectedSlot = value.selectedSlot;
    if (value.crafting !== null) {
      const job = value.crafting;
      if (!record(job) || !isRecipeId(job.recipeId) ||
          (!hasAdvancedCrafting && RECIPES[job.recipeId].station !== null) ||
          (!hasAdvancedCrafting && ["workbench", "furnace", "copperIngot", "copperPickaxe",
            "forge", "ironIngot", "ironPickaxe"].includes(job.recipeId)) ||
          (!hasCombatWeapons && ["woodSword", "copperSword", "ironSword"].includes(job.recipeId)) ||
          (!hasBed && (job.recipeId === "bed" || job.recipeId === "woodPickaxe")) ||
          (!hasTraps && (job.recipeId === "woodSpikes" || job.recipeId === "ironSpikes")) ||
          (!hasChests && (job.recipeId === "smallChest" || job.recipeId === "mediumChest" ||
            job.recipeId === "largeChest")) ||
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
    const oldItems = ["dirt", "stone", "pine_log", "ladder", "torch"] as const;
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
        edit.block === Block.Bedrock || (!hasResources && edit.block > Block.StoneStairs) ||
        (!hasLighting && edit.block === Block.Torch) ||
        (!hasHotbar && (edit.block === Block.WoodStairs || edit.block === Block.StoneStairs)) ||
        (!hasAdvancedCrafting && (edit.block === Block.Workbench || edit.block === Block.Furnace ||
          edit.block === Block.Forge)) ||
        (!hasBed && edit.block === Block.Bed) ||
        (!hasTraps && (edit.block === Block.WoodSpikes || edit.block === Block.IronSpikes)) ||
        (!hasChests && (edit.block === Block.SmallChest || edit.block === Block.MediumChest ||
          edit.block === Block.LargeChest))) {
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
  const generatorVersion = value.generatorVersion === 1 ? 1 : value.generatorVersion === 2 ? 2 :
    value.generatorVersion === 3 ? 3 : value.generatorVersion === 4 ? 4 :
      value.generatorVersion === 5 ? 5 : value.generatorVersion === 6 ? 6 :
        value.generatorVersion === 7 ? 7 : 8;
  const generatedWorld = new WorldModel(value.seed, edits, generatorVersion);
  const rawBackgroundEdits = hasLayers ? value.backgroundEdits : [];
  if (!Array.isArray(rawBackgroundEdits) || edits.length + rawBackgroundEdits.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de modifications d'arrière-plan invalide ou trop volumineuse.");
  }
  const backgroundCells = new Set<string>();
  const backgroundEdits: TileEdit[] = rawBackgroundEdits.map((edit: unknown) => {
    if (!record(edit) || !integer(edit.x, -MAX_TILE_X, MAX_TILE_X) ||
        !integer(edit.y, 0, WORLD_HEIGHT - 2) || !isBlockId(edit.block) ||
        (!hasResources && edit.block > Block.StoneStairs)) {
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
  const rawCollected = hasResources ? value.collectedNaturalPickups : [];
  if (!Array.isArray(rawCollected) || rawCollected.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de récoltes naturelles invalide.");
  }
  const collected = new Set<string>();
  for (const id of rawCollected) {
    if (typeof id !== "string" || collected.has(id)) throw new SaveValidationError("Récolte naturelle invalide ou dupliquée.");
    const caveMatch = /^cave-monster:(-?\d+),(\d+)$/.exec(id);
    if (caveMatch) {
      const x = Number(caveMatch[1]);
      const y = Number(caveMatch[2]);
      if (!integer(x, -MAX_TILE_X, MAX_TILE_X) || !integer(y, 0, WORLD_HEIGHT - 2) ||
          id !== `cave-monster:${x},${y}` || !world.generator.caveMonsterAt(x, y)) {
        throw new SaveValidationError("Monstre naturel invalide.");
      }
      collected.add(id);
      continue;
    }
    const match = /^natural:(-?\d+),(\d+):(fish_raw|shell|pearl|apple|pear|peach|apricot)$/.exec(id);
    if (!match || !integer(Number(match[1]), -MAX_TILE_X, MAX_TILE_X) ||
        !integer(Number(match[2]), 0, WORLD_HEIGHT - 2) ||
        id !== `natural:${Number(match[1])},${Number(match[2])}:${match[3]}` ||
        !world.generator.pickupsAt(Number(match[1]), Number(match[2])).some((pickup) => pickup.itemId === match[3])) {
      throw new SaveValidationError("Récolte naturelle inexistante.");
    }
    collected.add(id);
  }
  const rawPlants = integer(value.schemaVersion, 10, 18) ? value.collectedPlants : [];
  if (!Array.isArray(rawPlants) || rawPlants.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de plantes récoltées invalide.");
  }
  const collectedPlants = new Set<string>();
  for (const id of rawPlants) {
    if (typeof id !== "string" || collectedPlants.has(id)) {
      throw new SaveValidationError("Plante récoltée invalide ou dupliquée.");
    }
    const match = /^plant:(-?\d+),(\d+):([a-z_]+)$/.exec(id);
    const plant = match && PLANT_ITEMS.find((item) => item === match[3]);
    if (!match || !plant || !integer(Number(match[1]), -MAX_TILE_X, MAX_TILE_X) ||
        !integer(Number(match[2]), 0, WORLD_HEIGHT - 2) ||
        id !== `plant:${Number(match[1])},${Number(match[2])}:${plant}` ||
        !world.generator.harvestAt(Number(match[1]), Number(match[2])).includes(plant)) {
      throw new SaveValidationError("Plante récoltée inexistante.");
    }
    collectedPlants.add(id);
  }
  const rawSurvival = hasSurvival && record(value.survival) ? {
    ...value.survival,
    initialSpawnPoint: record(value.survival.initialSpawnPoint)
      ? value.survival.initialSpawnPoint : value.survival.spawnPoint,
    respawnBed: value.survival.respawnBed ?? null,
  } : {
    health: PLAYER_MAX_HEALTH, invulnerabilityTicks: 0, dead: false, respawnTicks: 0,
    spawnPoint: { x: playerX, y: playerY }, initialSpawnPoint: { x: playerX, y: playerY },
    respawnBed: null,
  };
  const rawRespawnBed = record(rawSurvival) ? rawSurvival.respawnBed : undefined;
  if (!record(rawSurvival) ||
      !integer(rawSurvival.health, 0, PLAYER_MAX_HEALTH) ||
      !integer(rawSurvival.invulnerabilityTicks, 0, RESPAWN_INVULNERABILITY_TICKS) ||
      typeof rawSurvival.dead !== "boolean" ||
      !integer(rawSurvival.respawnTicks, 0, RESPAWN_TICKS) ||
      (rawSurvival.dead ? rawSurvival.health !== 0 || rawSurvival.respawnTicks === 0
        : rawSurvival.health === 0 || rawSurvival.respawnTicks !== 0) ||
      !record(rawSurvival.spawnPoint) ||
      !finite(rawSurvival.spawnPoint.x, -MAX_TILE_X * TILE_SIZE, MAX_TILE_X * TILE_SIZE - PLAYER_WIDTH) ||
      !finite(rawSurvival.spawnPoint.y, 0, (WORLD_HEIGHT - 1) * TILE_SIZE - PLAYER_HEIGHT) ||
      !record(rawSurvival.initialSpawnPoint) ||
      !finite(rawSurvival.initialSpawnPoint.x, -MAX_TILE_X * TILE_SIZE, MAX_TILE_X * TILE_SIZE - PLAYER_WIDTH) ||
      !finite(rawSurvival.initialSpawnPoint.y, 0, (WORLD_HEIGHT - 1) * TILE_SIZE - PLAYER_HEIGHT) ||
      (rawRespawnBed !== null && (!record(rawRespawnBed) ||
        !integer(rawRespawnBed.x, -MAX_TILE_X, MAX_TILE_X) ||
        !integer(rawRespawnBed.y, 0, WORLD_HEIGHT - 2)))) {
    throw new SaveValidationError("État de survie invalide.");
  }
  const survival: SurvivalState = {
    health: rawSurvival.health,
    invulnerabilityTicks: rawSurvival.invulnerabilityTicks,
    dead: rawSurvival.dead,
    respawnTicks: rawSurvival.respawnTicks,
    spawnPoint: { x: rawSurvival.spawnPoint.x, y: rawSurvival.spawnPoint.y },
    initialSpawnPoint: {
      x: rawSurvival.initialSpawnPoint.x, y: rawSurvival.initialSpawnPoint.y,
    },
    respawnBed: record(rawRespawnBed) && integer(rawRespawnBed.x, -MAX_TILE_X, MAX_TILE_X) &&
        integer(rawRespawnBed.y, 0, WORLD_HEIGHT - 2) ? {
      x: rawRespawnBed.x, y: rawRespawnBed.y,
    } : null,
  };
  const difficulty = hasSurvival ? value.difficulty : "standard";
  if (!isDifficultyId(difficulty)) throw new SaveValidationError("Difficulté de sauvegarde invalide.");
  const rawZombies = hasSurvival ? value.zombies : [];
  if (!Array.isArray(rawZombies) || rawZombies.length > DIFFICULTIES.perilous.maxActiveZombies) {
    throw new SaveValidationError("Liste de zombies invalide ou trop volumineuse.");
  }
  if (difficulty === "creative" && rawZombies.length > 0) {
    throw new SaveValidationError("Le mode créatif ne peut pas contenir de zombies.");
  }
  const zombieIds = new Set<string>();
  const zombies: ZombieState[] = rawZombies.map((entry: unknown) => {
    if (!record(entry) || !text(entry.id, 80) || !/^[a-zA-Z0-9-]+$/.test(entry.id) ||
        zombieIds.has(entry.id) ||
        !finite(entry.x, -MAX_TILE_X * TILE_SIZE, MAX_TILE_X * TILE_SIZE - ZOMBIE_WIDTH) ||
        !finite(entry.y, 0, (WORLD_HEIGHT - 1) * TILE_SIZE - ZOMBIE_HEIGHT) ||
        !finite(entry.vx, -100, 100) || !finite(entry.vy, -400, 400) ||
        !integer(entry.health, 1, ZOMBIE_MAX_HEALTH) ||
        typeof entry.grounded !== "boolean" ||
        !integer(entry.attackCooldown, 0, ZOMBIE_ATTACK_COOLDOWN) ||
        (entry.digCooldown !== undefined &&
          !integer(entry.digCooldown, 0, ZOMBIE_DIG_COOLDOWN)) ||
        (entry.stunTicks !== undefined &&
          !integer(entry.stunTicks, 0, 16))) {
      throw new SaveValidationError("Zombie de sauvegarde invalide.");
    }
    zombieIds.add(entry.id);
    const zombie = {
      id: entry.id, x: entry.x, y: entry.y, vx: entry.vx, vy: entry.vy, health: entry.health,
      grounded: entry.grounded, attackCooldown: entry.attackCooldown,
      stunTicks: entry.stunTicks ?? 0,
      digCooldown: entry.digCooldown ?? 0,
    };
    if (zombieOverlapsSolid(world, zombie)) throw new SaveValidationError("Zombie bloqué dans un bloc solide.");
    return zombie;
  });
  const rawNightWave = hasSurvival ? value.nightWave : {
    lastStartedDay: -1, pending: 0, nextSpawnTick: value.tick,
  };
  if (!record(rawNightWave) ||
      !integer(rawNightWave.lastStartedDay, -1, Number.MAX_SAFE_INTEGER) ||
      !integer(rawNightWave.pending, 0, DIFFICULTIES.perilous.hordeSize) ||
      !integer(rawNightWave.nextSpawnTick, 0, Number.MAX_SAFE_INTEGER)) {
    throw new SaveValidationError("État de horde nocturne invalide.");
  }
  if (difficulty === "creative" && rawNightWave.pending !== 0) {
    throw new SaveValidationError("Le mode créatif ne peut pas conserver de horde en attente.");
  }
  const nightWave: NightWaveState = {
    lastStartedDay: rawNightWave.lastStartedDay,
    pending: rawNightWave.pending,
    nextSpawnTick: rawNightWave.nextSpawnTick,
  };
  const rawChests = hasChests ? value.chests : [];
  if (!Array.isArray(rawChests) || rawChests.length > MAX_EDITS) {
    throw new SaveValidationError("Liste de coffres invalide ou trop volumineuse.");
  }
  const chestCells = new Set<string>();
  const chests: ChestState[] = rawChests.map((entry: unknown) => {
    if (!record(entry) || !CHEST_ITEMS.some((item) => item === entry.itemId) ||
        !integer(entry.x, -MAX_TILE_X, MAX_TILE_X) ||
        !integer(entry.y, 0, WORLD_HEIGHT - 2) ||
        !Array.isArray(entry.slots)) {
      throw new SaveValidationError("Coffre de sauvegarde invalide.");
    }
    const itemId = entry.itemId as keyof typeof CHEST_CAPACITY;
    const key = cellKey(entry.x, entry.y);
    if (chestCells.has(key) || world.getBlock(entry.x, entry.y) !== CHEST_BLOCKS[itemId] ||
        entry.slots.length !== CHEST_CAPACITY[itemId]) {
      throw new SaveValidationError("Emplacement ou capacité de coffre invalide.");
    }
    chestCells.add(key);
    return {
      x: entry.x, y: entry.y, itemId,
      slots: entry.slots.map((slot: unknown) => slot === null ? null : validateStack(slot, true, true, "coffre")),
    };
  });
  const result: SaveGame = {
    format: "kingdoms-beneath", schemaVersion: 18, generatorVersion,
    id: value.id, name: value.name, seed: value.seed,
    createdAt: value.createdAt, updatedAt: value.updatedAt, tick: value.tick,
    player: {
      x: playerX, y: playerY, vx: playerVx, vy: playerVy,
      grounded, climbing, facing,
    },
    inventory: validatedInventory,
    hotbar, hotbarPlanes, selectedSlot, crafting, edits, backgroundEdits,
    groundDrops, creativeMode, blockDamage, lightingQuality,
    collectedNaturalPickups: [...collected].sort(),
    collectedPlants: [...collectedPlants].sort(),
    difficulty, survival, zombies, nightWave, chests,
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
