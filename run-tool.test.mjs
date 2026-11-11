import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = dirname(fileURLToPath(import.meta.url));
const fixture = `
import { spawnSync } from "node:child_process";
if (process.env.WS_NO_BUFFER_UTIL !== "1") throw new Error("WS_NO_BUFFER_UTIL manquant au chargement.");
const child = spawnSync(process.execPath, ["-p", "process.env.WS_NO_BUFFER_UTIL"], { encoding: "utf8" });
if (child.status !== 0) throw new Error("Impossible de vérifier l'environnement hérité.");
if (process.argv.includes("--exit=7")) process.exitCode = 7;
else process.stdout.write(JSON.stringify({
  value: process.env.WS_NO_BUFFER_UTIL,
  inherited: child.stdout.trim(),
  args: process.argv.slice(2),
  entry: process.argv[1],
}));
`;

describe("secure Vite and Vitest launcher", () => {
  let directory;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "kingdoms-tool-"));
    mkdirSync(join(directory, "node_modules", "vite", "bin"), { recursive: true });
    mkdirSync(join(directory, "node_modules", "vitest"), { recursive: true });
    copyFileSync(join(project, "run-tool.mjs"), join(directory, "run-tool.mjs"));
    writeFileSync(join(directory, "node_modules", "vite", "package.json"), '{"type":"module"}');
    writeFileSync(join(directory, "node_modules", "vite", "bin", "vite.js"), fixture);
    writeFileSync(join(directory, "node_modules", "vitest", "vitest.mjs"), fixture);
  });

  afterEach(() => {
    rmSync(join(directory, "run-tool.mjs"), { force: true });
    rmSync(join(directory, "node_modules", "vite", "package.json"), { force: true });
    rmSync(join(directory, "node_modules", "vite", "bin", "vite.js"), { force: true });
    rmSync(join(directory, "node_modules", "vitest", "vitest.mjs"), { force: true });
    rmdirSync(join(directory, "node_modules", "vite", "bin"));
    rmdirSync(join(directory, "node_modules", "vite"));
    rmdirSync(join(directory, "node_modules", "vitest"));
    rmdirSync(join(directory, "node_modules"));
    rmdirSync(directory);
  });

  function run(tool, args, currentValue) {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    if (currentValue === undefined) delete env.WS_NO_BUFFER_UTIL;
    else env.WS_NO_BUFFER_UTIL = currentValue;
    return spawnSync(process.execPath, [join(directory, "run-tool.mjs"), tool, ...args], {
      cwd: directory, env, encoding: "utf8", timeout: 10_000, windowsHide: true,
    });
  }

  it.each([
    ["vite", ["--host", "127.0.0.1"], undefined],
    ["vite", ["build", "--base", "/game/"], ""],
    ["vite", ["preview", "--port", "4000"], "0"],
    ["vitest", ["run", "sample.test.ts"], "false"],
  ])("sets the guard before loading %s and forwards arguments", (tool, args, currentValue) => {
    const result = run(tool, args, currentValue);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      value: "1",
      inherited: "1",
      args,
      entry: tool === "vite"
        ? join(directory, "node_modules", "vite", "bin", "vite.js")
        : join(directory, "node_modules", "vitest", "vitest.mjs"),
    });
  });

  it("propagates the tool's exit status", () => {
    const result = run("vite", ["--exit=7"], "");
    expect(result.status).toBe(7);
  });

  it("rejects unknown tools and reports missing dependencies", () => {
    const unknown = run("unknown", [], "");
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain("Outil inconnu");
    rmSync(join(directory, "node_modules", "vite", "bin", "vite.js"));
    const missing = run("vite", [], "");
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("ERR_MODULE_NOT_FOUND");
  });

  it("routes all project Vite and Vitest commands through the launcher", () => {
    const { scripts } = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    expect(scripts).toMatchObject({
      dev: "node run-tool.mjs vite",
      test: "node run-tool.mjs vitest run",
      build: "node run-tool.mjs vite build",
      preview: "node run-tool.mjs vite preview",
    });
  });
});
