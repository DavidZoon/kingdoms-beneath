export const DIFFICULTY_IDS = ["creative", "exploration", "standard", "perilous"] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

export interface Difficulty {
  id: DifficultyId;
  label: string;
  description: string;
  zombieDamage: number;
  hordeSize: number;
  maxActiveZombies: number;
  spawnIntervalTicks: number;
  deathItemLossPercent: 0 | 25 | 100;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  creative: {
    id: "creative",
    label: "Mode créatif",
    description: "Aucun ennemi ni dégât de combat, aucune perte à la mort et menu DEV disponible.",
    zombieDamage: 0,
    hordeSize: 0,
    maxActiveZombies: 0,
    spawnIntervalTicks: 60,
    deathItemLossPercent: 0,
  },
  exploration: {
    id: "exploration",
    label: "Exploration",
    description: "Menaces réduites, trois zombies au maximum et aucun objet perdu à la mort.",
    zombieDamage: 8,
    hordeSize: 3,
    maxActiveZombies: 3,
    spawnIntervalTicks: 240,
    deathItemLossPercent: 0,
  },
  standard: {
    id: "standard",
    label: "Standard",
    description: "Équilibre de référence, six zombies au maximum et 25 % des objets déposés à la mort.",
    zombieDamage: 15,
    hordeSize: 6,
    maxActiveZombies: 6,
    spawnIntervalTicks: 180,
    deathItemLossPercent: 25,
  },
  perilous: {
    id: "perilous",
    label: "Périlleux",
    description: "Horde de dix zombies, dégâts renforcés et totalité des objets transportés déposée à la mort.",
    zombieDamage: 22,
    hordeSize: 10,
    maxActiveZombies: 10,
    spawnIntervalTicks: 120,
    deathItemLossPercent: 100,
  },
};

export function isDifficultyId(value: unknown): value is DifficultyId {
  return DIFFICULTY_IDS.some((id) => id === value);
}
