import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let cachedRoot: string | undefined;

/**
 * Monorepo root (directory containing pnpm-workspace.yaml).
 * Walks up from the caller file — no brittle `../../../` paths.
 */
export function repoRoot(startDir?: string): string {
  if (cachedRoot) return cachedRoot;

  let dir =
    startDir ??
    (typeof import.meta.url !== "undefined"
      ? dirname(fileURLToPath(import.meta.url))
      : process.cwd());

  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      cachedRoot = dir;
      return dir;
    }
    dir = dirname(dir);
  }

  throw new Error("Could not find monorepo root (pnpm-workspace.yaml)");
}

/** Absolute path to the root `.env` file. */
export function rootEnvPath(): string {
  return resolve(repoRoot(), ".env");
}

/** Load root `.env`, overriding any pre-set shell variables (e.g. stale DATABASE_URL). */
export function loadRootEnv(): void {
  config({ path: rootEnvPath(), override: true });
}
