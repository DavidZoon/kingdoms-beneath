import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const tools = new Map([
  ["vite", ["node_modules", "vite", "bin", "vite.js"]],
  ["vitest", ["node_modules", "vitest", "vitest.mjs"]],
]);

const tool = process.argv[2];
const parts = tools.get(tool);
if (!parts) throw new Error("Outil inconnu : choisissez vite ou vitest.");

process.env.WS_NO_BUFFER_UTIL = "1";
const entry = join(dirname(fileURLToPath(import.meta.url)), ...parts);
process.argv.splice(1, 2, entry);
await import(pathToFileURL(entry).href);
