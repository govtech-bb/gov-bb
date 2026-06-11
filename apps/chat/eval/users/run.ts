// User-simulation evals: an LLM persona drives a full multi-turn conversation
// against the REAL deployed chat — forms collection, offers, cancels, escape
// hatches — and the run is graded on the OUTCOME, not the first reply.
//
// This is the harness `eval/responses` can't be: that one sends a single
// first message and string-matches the reply, so everything that happens in
// turns 2–15 (where all the collection behaviour lives) is invisible to it.
//
// Per scenario:
//   1. fresh ChatClient with a stable threadId (keeps the server form session
//      alive across turns, like the real client does)
//   2. a `claude -p` user-sim generates each user message from the persona,
//      goal, facts, and the assistant's latest reply + interactive affordances
//      (choice buttons, form questions, skip/alternative buttons)
//   3. the loop ends at the scenario's stop condition — reaching the submit
//      APPROVAL prompt counts as success and is answered "Not yet", so evals
//      NEVER create real submissions
//   4. grading: mechanical assertions on the transcript (tools observed,
//      stop condition reached) + a `claude -p` judge over the full transcript
//      with the scenario's rubric
//
// Usage: pnpm eval:users [--only=id,id]
//   CHAT_URL defaults to the deployed sandbox.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { createChatDevtoolsBridge } from "@tanstack/ai-client/devtools";
import { extractText } from "../../src/lib/chat/messages";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCENARIOS_PATH = join(HERE, "scenarios.json");
const RESULTS_PATH = join(HERE, "results.json");
const REPORT_PATH = join(HERE, "report.html");

const CHAT_URL = process.env.CHAT_URL ?? "https://chat.sandbox.alpha.gov.bb";
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 2);
const TURN_TIMEOUT_MS = 90_000;
const SIM_TIMEOUT_MS = 120_000;

interface Scenario {
  id: string;
  persona: string;
  goal: string;
  facts: Record<string, string>;
  behaviour: string[];
  maxTurns: number;
  stopWhen: "approval-prompt" | "link-delivered" | "goal-judged";
  mechanical: { mustUseTools: string[]; neverTools: string[] };
  rubric: string;
}

interface Affordances {
  choices: string[];
  field?: {
    label: string;
    options: string[];
    optional: boolean;
    alternative?: string;
  };
  reviewShown: boolean;
  approvalPending: boolean;
  linkDelivered: boolean;
}

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  affordances?: Affordances;
}

interface ScenarioResult {
  scenario: Scenario;
  transcript: TranscriptEntry[];
  toolsObserved: string[];
  reached: string;
  turns: number;
  durationMs: number;
  error?: string;
  mechanical?: { pass: boolean; reasons: string[] };
  verdict?: { pass: boolean; reason: string };
}

// --------------------------------------------------------------- claude -p

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "json"], {
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${SIM_TIMEOUT_MS}ms`));
    }, SIM_TIMEOUT_MS);
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

async function claudeJson<T>(prompt: string): Promise<T> {
  const stdout = await runClaude(prompt);
  const result = (JSON.parse(stdout) as { result?: string }).result ?? "";
  const match = result.match(/\{[\s\S]*\}/);
  if (!match)
    throw new Error(`no JSON in claude output: ${result.slice(0, 200)}`);
  return JSON.parse(match[0]) as T;
}

// ----------------------------------------------------------- the user sim

function describeAffordances(a: Affordances): string {
  const parts: string[] = [];
  if (a.choices.length) {
    parts.push(`Choice buttons shown: ${JSON.stringify(a.choices)}`);
  }
  if (a.field) {
    let q = `Form question shown: "${a.field.label}"`;
    if (a.field.options.length)
      q += ` with answer buttons ${JSON.stringify(a.field.options)}`;
    if (a.field.optional) q += ` (optional — a Skip button is available)`;
    if (a.field.alternative)
      q += ` (an alternative button is available: "${a.field.alternative}")`;
    parts.push(q);
  }
  if (a.reviewShown)
    parts.push(
      "A check-your-answers review summary of everything collected is shown.",
    );
  return parts.join("\n") || "(no buttons or form widgets — plain text reply)";
}

async function nextUserMessage(
  s: Scenario,
  transcript: TranscriptEntry[],
): Promise<string> {
  const history = transcript
    .map(
      (t) =>
        `${t.role === "user" ? "YOU" : "ASSISTANT"}: ${t.text}${
          t.affordances ? `\n[${describeAffordances(t.affordances)}]` : ""
        }`,
    )
    .join("\n\n");
  const facts = Object.entries(s.facts)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const out = await claudeJson<{ message?: string }>(
    `You are simulating a REAL USER of the Government of Barbados chat assistant, for automated testing. Stay strictly in character.

PERSONA:
${s.persona}

YOUR GOAL:
${s.goal}

YOUR FACTS (use these exact values when asked; NEVER invent different ones; if a fact isn't listed, improvise something consistent and plausible):
${facts || "(none needed)"}

BEHAVIOUR RULES:
${s.behaviour.map((b) => `- ${b}`).join("\n")}

CONVERSATION SO FAR (YOU = the user you are simulating):
${history || "(none — this is your first message)"}

Write the user's NEXT message: ONE short message, in character. If a button shown above matches what you want, reply with EXACTLY that button's text and nothing else. If your goal is complete per your rules, reply with exactly DONE.
Output ONLY a JSON object, no other text: {"message": "<the message>"}`,
  );
  const msg = (out.message ?? "").trim();
  if (!msg) throw new Error("user sim returned an empty message");
  return msg;
}

// ----------------------------------------------------- transcript capture

type AnyPart = {
  type: string;
  name?: string;
  state?: string;
  output?: unknown;
  arguments?: string;
  approval?: { id: string };
};

function partsOf(m: { parts?: unknown }): AnyPart[] {
  return Array.isArray(m.parts) ? (m.parts as AnyPart[]) : [];
}

const MD_LINK_RE = /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/;

function readAffordances(
  assistantMessages: Array<{ parts?: unknown }>,
  replyText: string,
): Affordances {
  const a: Affordances = {
    choices: [],
    reviewShown: false,
    approvalPending: false,
    linkDelivered: MD_LINK_RE.test(replyText),
  };
  for (const m of assistantMessages) {
    for (const p of partsOf(m)) {
      if (p.type !== "tool-call") continue;
      if (p.name === "present_choices") {
        try {
          const args = JSON.parse(p.arguments ?? "{}") as { choices?: unknown };
          if (Array.isArray(args.choices))
            a.choices.push(
              ...args.choices.filter((c): c is string => typeof c === "string"),
            );
        } catch {
          // partial args on a stalled stream — ignore
        }
      }
      if (p.name === "ask_field" && p.state === "complete") {
        const out = p.output as
          | {
              ok?: boolean;
              field?: {
                label?: string;
                options?: Array<{ label?: string }>;
                validations?: { required?: unknown };
                alternative?: { label?: string };
              };
            }
          | undefined;
        if (out?.ok && out.field?.label) {
          a.field = {
            label: out.field.label,
            options: (out.field.options ?? [])
              .map((o) => o.label ?? "")
              .filter(Boolean),
            optional: !out.field.validations?.required,
            alternative: out.field.alternative?.label,
          };
        }
      }
      if (p.name === "review_form" && p.state === "complete") {
        a.reviewShown = true;
      }
      if (p.name === "submit_form" && p.state === "approval-requested") {
        a.approvalPending = true;
      }
    }
  }
  return a;
}

// ------------------------------------------------------------ the driver

async function runScenario(s: Scenario): Promise<ScenarioResult> {
  const started = Date.now();
  const transcript: TranscriptEntry[] = [];
  const toolsObserved = new Set<string>();
  let reached = "max-turns";
  let error: string | undefined;

  const client = new ChatClient({
    devtoolsBridgeFactory: createChatDevtoolsBridge,
    connection: fetchServerSentEvents(`${CHAT_URL}/api/chat`),
    body: { threadId: randomUUID() },
    onError: (err) => {
      error ??= err.message;
    },
  });

  let turns = 0;
  try {
    let seenMessages = 0;
    while (turns < s.maxTurns) {
      const userMsg = await nextUserMessage(s, transcript);
      if (userMsg === "DONE") {
        reached = "user-done";
        break;
      }
      transcript.push({ role: "user", text: userMsg });
      turns++;

      const timer = setTimeout(() => client.stop(), TURN_TIMEOUT_MS);
      try {
        await client.sendMessage(userMsg);
      } finally {
        clearTimeout(timer);
      }

      const all = client.getMessages();
      const fresh = all.slice(seenMessages);
      seenMessages = all.length;
      const newAssistant = fresh.filter((m) => m.role === "assistant");
      for (const m of newAssistant) {
        for (const p of partsOf(m)) {
          if (p.type === "tool-call" && p.name) toolsObserved.add(p.name);
        }
      }
      const replyText = newAssistant.map(extractText).join("\n").trim();
      const affordances = readAffordances(newAssistant, replyText);
      transcript.push({
        role: "assistant",
        text: replyText || "(no text)",
        affordances,
      });

      // The submit approval gate is every collect scenario's finish line —
      // decline it so the eval NEVER creates a real submission.
      if (affordances.approvalPending) {
        const approvalPart = newAssistant
          .flatMap(partsOf)
          .find(
            (p) => p.name === "submit_form" && p.state === "approval-requested",
          );
        if (approvalPart?.approval?.id) {
          await client.addToolApprovalResponse({
            id: approvalPart.approval.id,
            approved: false,
          });
        }
        reached = "approval-prompt";
        break;
      }
      if (s.stopWhen === "link-delivered" && affordances.linkDelivered) {
        reached = "link-delivered";
        break;
      }
      if (error) break;
    }
  } catch (err) {
    error ??= err instanceof Error ? err.message : String(err);
  }

  return {
    scenario: s,
    transcript,
    toolsObserved: [...toolsObserved],
    reached,
    turns,
    durationMs: Date.now() - started,
    ...(error !== undefined && { error }),
  };
}

// ----------------------------------------------------------------- grade

function gradeMechanical(r: ScenarioResult): {
  pass: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { mustUseTools, neverTools } = r.scenario.mechanical;
  for (const t of mustUseTools) {
    if (!r.toolsObserved.includes(t)) reasons.push(`never used tool ${t}`);
  }
  for (const t of neverTools) {
    if (r.toolsObserved.includes(t)) reasons.push(`used forbidden tool ${t}`);
  }
  if (
    r.scenario.stopWhen !== "goal-judged" &&
    r.reached !== r.scenario.stopWhen
  ) {
    reasons.push(
      `expected to reach ${r.scenario.stopWhen}, ended at ${r.reached} after ${r.turns} turns`,
    );
  }
  if (r.error) reasons.push(`error: ${r.error}`);
  return { pass: reasons.length === 0, reasons };
}

async function gradeJudge(
  r: ScenarioResult,
): Promise<{ pass: boolean; reason: string }> {
  const transcript = r.transcript
    .map(
      (t) =>
        `${t.role.toUpperCase()}: ${t.text}${
          t.affordances ? `\n[UI: ${describeAffordances(t.affordances)}]` : ""
        }`,
    )
    .join("\n\n");
  const out = await claudeJson<{ pass?: boolean; reason?: string }>(
    `You are evaluating a full multi-turn conversation between a simulated user and the Government of Barbados chat assistant.

THE SIMULATED USER:
${r.scenario.persona}
Their goal: ${r.scenario.goal}

FULL TRANSCRIPT (with the interactive UI each assistant turn rendered):
"""
${transcript}
"""

EVALUATION QUESTION:
${r.scenario.rubric}

Judge the ASSISTANT only (the user is a script). Output ONLY a JSON object, no other text: {"pass": true|false, "reason": "<one or two sentences>"}`,
  );
  return {
    pass: out.pass === true,
    reason: out.reason ?? "(no reason given)",
  };
}

// ---------------------------------------------------------------- report

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function scenarioHtml(r: ScenarioResult, open: boolean): string {
  const pass = r.mechanical?.pass && r.verdict?.pass;
  const badge = pass
    ? `<span class="badge pass">PASS</span>`
    : `<span class="badge fail">FAIL</span>`;
  const transcript = r.transcript
    .map(
      (t) =>
        `<div class="${t.role}"><strong>${t.role}</strong>: ${esc(t.text)}${
          t.affordances
            ? `<div class="ui">${esc(describeAffordances(t.affordances))}</div>`
            : ""
        }</div>`,
    )
    .join("\n");
  return `<details${open ? " open" : ""}>
<summary>${badge} <code>${esc(r.scenario.id)}</code> — ${r.turns} turns, reached <em>${esc(r.reached)}</em> (${Math.round(r.durationMs / 1000)}s)</summary>
<dl>
<dt>Mechanical</dt><dd>${r.mechanical?.pass ? "pass" : esc(r.mechanical?.reasons.join("; ") ?? "?")}</dd>
<dt>Judge</dt><dd>${esc(r.verdict?.reason ?? "not judged")}</dd>
<dt>Tools observed</dt><dd>${r.toolsObserved.map((t) => `<code>${esc(t)}</code>`).join(" ") || "none"}</dd>
${r.error ? `<dt>Error</dt><dd><pre>${esc(r.error)}</pre></dd>` : ""}
<dt>Transcript</dt><dd>${transcript}</dd>
</dl>
</details>`;
}

function report(results: ScenarioResult[]): void {
  const pass = results.filter(
    (r) => r.mechanical?.pass && r.verdict?.pass,
  ).length;
  const failures = results.filter(
    (r) => !(r.mechanical?.pass && r.verdict?.pass),
  );
  const passes = results.filter((r) => r.mechanical?.pass && r.verdict?.pass);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>User-simulation evals</title>
<style>
body { font: 15px/1.5 system-ui, sans-serif; max-width: 64rem; margin: 2rem auto; padding: 0 1rem; }
.badge { font-weight: 700; padding: .1rem .5rem; border-radius: .3rem; color: #fff; }
.badge.pass { background: #1a7f37; } .badge.fail { background: #c1121f; }
details { border: 1px solid #ddd; border-radius: .4rem; padding: .5rem .8rem; margin-block: .5rem; }
summary { cursor: pointer; } pre { white-space: pre-wrap; background: #f6f6f6; padding: .5rem; }
dt { font-weight: 600; margin-top: .5rem; }
.user, .assistant { margin-block: .4rem; padding: .4rem .6rem; border-radius: .4rem; }
.user { background: #e8f0fe; } .assistant { background: #f6f6f6; }
.ui { color: #666; font-size: .85em; margin-top: .2rem; }
</style></head><body>
<h1>User-simulation evals</h1>
<p>${esc(CHAT_URL)} — ${new Date().toISOString()} — ${pass}/${results.length} passed</p>
<h2>Failures (${failures.length})</h2>
${failures.map((r) => scenarioHtml(r, true)).join("\n") || "<p>None 🎉</p>"}
<h2>Passes (${passes.length})</h2>
${passes.map((r) => scenarioHtml(r, false)).join("\n")}
</body></html>`;
  writeFileSync(REPORT_PATH, html);
}

// ------------------------------------------------------------------ main

async function main() {
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .split(",");
  let scenarios = (
    JSON.parse(readFileSync(SCENARIOS_PATH, "utf-8")) as {
      scenarios: Scenario[];
    }
  ).scenarios;
  if (only) scenarios = scenarios.filter((s) => only.includes(s.id));

  console.log(`[run] ${scenarios.length} scenarios → ${CHAT_URL}`);
  const results: ScenarioResult[] = new Array(scenarios.length);
  let next = 0;
  async function worker() {
    while (next < scenarios.length) {
      const i = next++;
      const r = await runScenario(scenarios[i]);
      r.mechanical = gradeMechanical(r);
      try {
        r.verdict = await gradeJudge(r);
      } catch (err) {
        r.verdict = {
          pass: false,
          reason: `judge failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      results[i] = r;
      const ok = r.mechanical.pass && r.verdict.pass;
      console.log(
        `[run] ${scenarios[i].id} → ${ok ? "PASS" : "FAIL"} (${r.turns} turns, reached ${r.reached})`,
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, scenarios.length) }, worker),
  );

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  report(results);
  const pass = results.filter(
    (r) => r.mechanical?.pass && r.verdict?.pass,
  ).length;
  console.log(`\n${pass}/${results.length} passed → ${REPORT_PATH}`);
  process.exit(pass === results.length ? 0 : 1);
}

void main();
