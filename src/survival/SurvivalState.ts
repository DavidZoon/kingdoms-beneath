export const PLAYER_MAX_HEALTH = 100;
export const RESPAWN_TICKS = 120;
export const RESPAWN_INVULNERABILITY_TICKS = 180;

export interface RespawnPoint {
  x: number;
  y: number;
}

export interface BedRespawnPoint {
  x: number;
  y: number;
}

export interface SurvivalState {
  health: number;
  invulnerabilityTicks: number;
  dead: boolean;
  respawnTicks: number;
  spawnPoint: RespawnPoint;
  initialSpawnPoint: RespawnPoint;
  respawnBed: BedRespawnPoint | null;
}
