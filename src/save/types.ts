import type { PlayerState } from "../player/PlayerController";
import type { ConstructionPlane, Inventory } from "../world/blocks";
import type { GeneratorVersion } from "../generation/WorldGenerator";
import type { ItemStack } from "../inventory/Inventory";
import type { CraftJob } from "../crafting/Recipes";
import type { TileEdit } from "../world/WorldModel";
import type { LightingQuality } from "../lighting/quality";
import type { DifficultyId } from "../survival/Difficulty";
import type { SurvivalState } from "../survival/SurvivalState";
import type { NightWaveState, ZombieState } from "../entities/Zombie";

export interface SaveGame {
  format: "kingdoms-beneath";
  schemaVersion: 13;
  generatorVersion: GeneratorVersion;
  id: string;
  name: string;
  seed: string;
  createdAt: number;
  updatedAt: number;
  tick: number;
  player: PlayerState;
  inventory: Inventory;
  hotbar: Array<ItemStack | null>;
  hotbarPlanes: ConstructionPlane[];
  selectedSlot: number;
  crafting: CraftJob | null;
  edits: TileEdit[];
  backgroundEdits: TileEdit[];
  groundDrops: GroundDrop[];
  collectedNaturalPickups: string[];
  collectedPlants: string[];
  creativeMode: boolean;
  blockDamage: BlockDamage[];
  lightingQuality: LightingQuality;
  difficulty: DifficultyId;
  survival: SurvivalState;
  zombies: ZombieState[];
  nightWave: NightWaveState;
}

export interface BlockDamage {
  x: number;
  y: number;
  damage: number;
  plane: ConstructionPlane;
}

export type GroundDrop = ItemStack & {
  id: string;
  x: number;
  y: number;
};
