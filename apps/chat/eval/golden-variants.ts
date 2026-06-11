// Propose real-user phrasing variants for golden.json entries.
//
// The hand-written golden queries skew toward the lexically-friendly phrasing
// ("get a copy of a birth certificate") — the easy case. Real users describe
// situations ("my mother passed and I need the paper for the bank") and many
// write in Bajan. This script asks `claude -p` for 2 natural paraphrases + 1
// Bajan variant per entry that has none, and writes them to
// golden-variants-proposed.json for HUMAN REVIEW — it never edits golden.json
// itself. Review the proposals, fix what's off, then paste the good ones into
// each entry's `variants` array (sweep.ts expands them automatically).
//
// Usage: pnpm eval:golden-variants [--only=id,id]

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const GOLDEN_PATH = join(HERE, "golden.json");
const OUT_PATH = join(HERE, "golden-variants-proposed.json");

interface Entry {
  id: string;
  query: string;
  expected_doc_ids: string[];
  tag: string;
  variants?: string[];
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "json"], {
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("claude timed out"));
    }, 120_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function proposeFor(e: Entry): Promise<string[]> {
  const stdout = await runClaude(
    `A retrieval eval for the Government of Barbados services chatbot has this golden query:

"${e.query}"

It expects these service documents: ${e.expected_doc_ids.join(", ")}.

Write 3 alternative phrasings a REAL user might type for the SAME need:
1. A situational paraphrase that describes the circumstance without naming the service (the way someone who doesn't know the service name would ask).
2. A terse/colloquial version (texting style, may have a typo).
3. A Barbadian (Bajan) dialect version, authentic, not caricature.

Each must still unambiguously mean the same need. Output ONLY a JSON object, no other text: {"variants": ["...", "...", "..."]}`,
  );
  const result = (JSON.parse(stdout) as { result?: string }).result ?? "";
  const match = result.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON for ${e.id}`);
  const parsed = JSON.parse(match[0]) as { variants?: unknown };
  if (!Array.isArray(parsed.variants)) throw new Error(`bad shape for ${e.id}`);
  return parsed.variants.filter((v): v is string => typeof v === "string");
}

async function main() {
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .split(",");
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")) as {
    entries: Entry[];
  };
  let targets = golden.entries.filter(
    (e) => !e.variants?.length && e.tag !== "none",
  );
  if (only) targets = targets.filter((e) => only.includes(e.id));

  const proposals: Record<string, string[]> = {};
  let done = 0;
  for (const e of targets) {
    try {
      proposals[e.id] = await proposeFor(e);
    } catch (err) {
      console.warn(
        `[skip] ${e.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
    done++;
    console.log(`[variants] ${done}/${targets.length} ${e.id}`);
  }

  writeFileSync(OUT_PATH, JSON.stringify(proposals, null, 2));
  console.log(
    `\n${Object.keys(proposals).length} proposals → ${OUT_PATH}\nReview them, then paste the good ones into golden.json entries' "variants".`,
  );
}

void main();
