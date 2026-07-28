import { stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Walk up from `start` looking for the pnpm workspace root (the dir holding
 * `pnpm-workspace.yaml`). Returns null if none is found within 8 levels.
 * Shared by the content and feature-route loaders to resolve landing's source
 * dirs from an arbitrary CWD.
 */
export async function findWorkspaceRoot(start: string): Promise<string | null> {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    try {
      await stat(join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      // ignore
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
