export const RESOURCES = {
  oak_log: { label: "Bûche de chêne", planes: ["foreground", "background"], isBlock: true, block: 13, color: "#8B5A2B", solid: false, durability: 8, opacity: true },
  pine_log: { label: "Bûche de pin", planes: ["foreground", "background"], isBlock: true, block: 4, color: "#6F4E37", solid: false, durability: 8, opacity: true },
  birch_log: { label: "Bûche de bouleau", planes: ["foreground", "background"], isBlock: true, block: 14, color: "#D8C7A1", solid: false, durability: 7, opacity: true },
  jungle_log: { label: "Bûche tropicale", planes: ["foreground", "background"], isBlock: true, block: 15, color: "#7A4A25", solid: false, durability: 9, opacity: true },
  deadwood_log: { label: "Bois mort", planes: ["foreground", "background"], isBlock: true, block: 16, color: "#5C4033", solid: false, durability: 5, opacity: true },
  oak_leaf: { label: "Feuille de chêne", planes: ["foreground"], isBlock: true, block: 17, color: "#3D8B3D", solid: false, durability: 1, opacity: false },
  pine_needle: { label: "Aiguilles de pin", planes: ["foreground"], isBlock: true, block: 18, color: "#2E6B3A", solid: false, durability: 1, opacity: false },
  vine: { label: "Liane", planes: ["foreground"], isBlock: false, color: "#2F8F4E", solid: false, durability: 0, opacity: false },
  tall_grass: { label: "Herbes hautes", planes: ["foreground"], isBlock: false, color: "#5FAE42", solid: false, durability: 0, opacity: false },
  reed: { label: "Roseau", planes: ["foreground"], isBlock: false, color: "#A7C957", solid: false, durability: 0, opacity: false },
  cotton_plant: { label: "Coton", planes: ["foreground"], isBlock: false, color: "#F2F2F2", solid: false, durability: 0, opacity: false },
  flax_plant: { label: "Lin", planes: ["foreground"], isBlock: false, color: "#7FB069", solid: false, durability: 0, opacity: false },
  hemp_plant: { label: "Chanvre", planes: ["foreground"], isBlock: false, color: "#5B8A4D", solid: false, durability: 0, opacity: false },
  wild_berry: { label: "Baies sauvages", planes: ["foreground"], isBlock: false, color: "#A61E4D", solid: false, durability: 0, opacity: false },
  mushroom_brown: { label: "Champignon brun", planes: ["foreground"], isBlock: false, color: "#8B6F47", solid: false, durability: 0, opacity: false },
  mushroom_red: { label: "Champignon rouge", planes: ["foreground"], isBlock: false, color: "#C1121F", solid: false, durability: 0, opacity: false },
  herb_mint: { label: "Menthe sauvage", planes: ["foreground"], isBlock: false, color: "#4CAF50", solid: false, durability: 0, opacity: false },
  lavender: { label: "Lavande", planes: ["foreground"], isBlock: false, color: "#8E7CC3", solid: false, durability: 0, opacity: false },
  aloe: { label: "Aloé", planes: ["foreground"], isBlock: false, color: "#6AA84F", solid: false, durability: 0, opacity: false },
  cactus_flesh: { label: "Chair de cactus", planes: ["foreground"], isBlock: false, color: "#5DA130", solid: false, durability: 0, opacity: false },
  clay: { label: "Argile", planes: ["foreground", "background"], isBlock: true, block: 19, color: "#B8735F", solid: true, durability: 5, opacity: true },
  sand: { label: "Sable", planes: ["foreground", "background"], isBlock: true, block: 20, color: "#D9C27A", solid: true, durability: 2, opacity: false },
  gravel: { label: "Gravier", planes: ["foreground", "background"], isBlock: true, block: 21, color: "#8E8E8E", solid: true, durability: 4, opacity: false },
  peat: { label: "Tourbe", planes: ["foreground", "background"], isBlock: true, block: 22, color: "#4A3428", solid: true, durability: 3, opacity: true },
  salt_crystal: { label: "Cristal de sel", planes: ["foreground"], isBlock: true, block: 23, color: "#F8F8F8", solid: true, durability: 6, opacity: false },
  limestone: { label: "Calcaire", planes: ["foreground", "background"], isBlock: true, block: 24, color: "#D9D2C3", solid: true, durability: 10, opacity: true },
  granite: { label: "Granit", planes: ["foreground", "background"], isBlock: true, block: 25, color: "#9B7B6F", solid: true, durability: 15, opacity: true },
  basalt: { label: "Basalte", planes: ["foreground", "background"], isBlock: true, block: 26, color: "#404040", solid: true, durability: 16, opacity: true },
  marble: { label: "Marbre", planes: ["foreground", "background"], isBlock: true, block: 27, color: "#E8E8E8", solid: true, durability: 14, opacity: true },
  slate: { label: "Ardoise", planes: ["foreground", "background"], isBlock: true, block: 28, color: "#4F5B66", solid: true, durability: 12, opacity: true },
  coal: { label: "Charbon", planes: ["foreground"], isBlock: true, block: 29, color: "#222222", solid: true, durability: 10, opacity: true },
  copper_ore: { label: "Minerai de cuivre", planes: ["foreground"], isBlock: true, block: 30, color: "#B87333", solid: true, durability: 12, opacity: true },
  tin_ore: { label: "Minerai d'étain", planes: ["foreground"], isBlock: true, block: 31, color: "#A8B0B8", solid: true, durability: 12, opacity: true },
  iron_ore: { label: "Minerai de fer", planes: ["foreground"], isBlock: true, block: 32, color: "#8A6A52", solid: true, durability: 14, opacity: true },
  silver_ore: { label: "Minerai d'argent", planes: ["foreground"], isBlock: true, block: 33, color: "#C0C0C0", solid: true, durability: 16, opacity: true },
  gold_ore: { label: "Minerai d'or", planes: ["foreground"], isBlock: true, block: 34, color: "#D4AF37", solid: true, durability: 18, opacity: true },
  lead_ore: { label: "Minerai de plomb", planes: ["foreground"], isBlock: true, block: 35, color: "#6E6E78", solid: true, durability: 15, opacity: true },
  nickel_ore: { label: "Minerai de nickel", planes: ["foreground"], isBlock: true, block: 36, color: "#A0A17F", solid: true, durability: 18, opacity: true },
  quartz: { label: "Quartz", planes: ["foreground"], isBlock: true, block: 37, color: "#F5F5F5", solid: true, durability: 14, opacity: false },
  sulfur: { label: "Soufre", planes: ["foreground"], isBlock: true, block: 38, color: "#E6D72A", solid: true, durability: 8, opacity: false },
  fur: { label: "Fourrure", planes: ["foreground"], isBlock: false, color: "#A67C52", solid: false, durability: 0, opacity: false },
  hide: { label: "Peau brute", planes: ["foreground"], isBlock: false, color: "#8C6239", solid: false, durability: 0, opacity: false },
  bone: { label: "Os", planes: ["foreground"], isBlock: false, color: "#E8E2D0", solid: false, durability: 0, opacity: false },
  feather: { label: "Plume", planes: ["foreground"], isBlock: false, color: "#F0F0F0", solid: false, durability: 0, opacity: false },
  raw_meat: { label: "Viande crue", planes: ["foreground"], isBlock: false, color: "#B03A2E", solid: false, durability: 0, opacity: false },
  milk: { label: "Lait", planes: ["foreground"], isBlock: false, color: "#FFFDF7", solid: false, durability: 0, opacity: false },
  wool: { label: "Laine", planes: ["foreground"], isBlock: false, color: "#F5F5F5", solid: false, durability: 0, opacity: false },
  egg: { label: "Œuf", planes: ["foreground"], isBlock: false, color: "#F8F4E3", solid: false, durability: 0, opacity: false },
  bee_wax: { label: "Cire d'abeille", planes: ["foreground"], isBlock: false, color: "#F2C94C", solid: false, durability: 0, opacity: false },
  honey: { label: "Miel", planes: ["foreground"], isBlock: false, color: "#E0A106", solid: false, durability: 0, opacity: false },
  fish_raw: { label: "Poisson cru", planes: ["foreground"], isBlock: false, color: "#7AA6C2", solid: false, durability: 0, opacity: false },
  shell: { label: "Coquillage", planes: ["foreground"], isBlock: false, color: "#E6D5C3", solid: false, durability: 0, opacity: false },
  pearl: { label: "Perle", planes: ["foreground"], isBlock: false, color: "#F4F1EA", solid: false, durability: 0, opacity: false },
  resin: { label: "Résine", planes: ["foreground"], isBlock: false, color: "#D99A2B", solid: false, durability: 0, opacity: false },
  sap: { label: "Sève", planes: ["foreground"], isBlock: false, color: "#CFAE4A", solid: false, durability: 0, opacity: false },
} as const;

export type ResourceId = keyof typeof RESOURCES;
export const PLANT_ITEMS = [
  "vine", "tall_grass", "reed", "cotton_plant", "flax_plant", "hemp_plant",
  "wild_berry", "mushroom_brown", "mushroom_red", "herb_mint", "lavender", "aloe", "cactus_flesh",
] as const satisfies readonly ResourceId[];
export type PlantItemId = (typeof PLANT_ITEMS)[number];

export function isPlantItem(item: ResourceId): item is PlantItemId {
  return PLANT_ITEMS.some((plant) => plant === item);
}

export const RESOURCE_ITEMS = Object.keys(RESOURCES) as ResourceId[];
export type ResourceBlockItemId = {
  [K in ResourceId]: (typeof RESOURCES)[K]["isBlock"] extends true ? K : never
}[ResourceId];

export function isResourceBlock(item: ResourceId): item is ResourceBlockItemId {
  return RESOURCES[item].isBlock;
}
