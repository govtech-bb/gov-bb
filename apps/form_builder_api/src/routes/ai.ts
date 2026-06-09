import { Router, type Request, type Response } from "express";
import { CustomComponent } from "@govtech-bb/database";
import { collectUnknownRefs, type UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { getDataSource } from "../db.js";
import { getFullCatalog } from "../catalog.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import { chat, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";

export const aiRouter = Router();

// The builder is stateless: every AI action is a single, self-contained turn.
// There is no server-side conversation — the editor owns the live draft and
// sends the current recipe JSON along with each edit, so there is no in-memory
// session to lose on restart (closes #332).

// Build the system prompt with the live custom components appended. This is the
// one DB read each convert call makes — one extra read per AI action, by design
// (the old per-session prompt cache is gone with the session model).
async function buildSystemPrompt(): Promise<string> {
  const ds = await getDataSource();
  const customs = await ds.getRepository(CustomComponent).find();
  const componentList = customs
    .map((c) => {
      const def = c.definition as Record<string, unknown>;
      return `- \`components/${c.namespace}/${c.type}\` — ${def?.htmlType ?? "unknown"} (${def?.label ?? "no label"})`;
    })
    .join("\n");

  const basePrompt = getSystemPrompt();
  return componentList
    ? `${basePrompt}\n\n## Live Custom Components (from database)\n${componentList}`
    : basePrompt;
}

// Compose the single user turn from the parts the editor sends. An Edit Form
// tweak arrives as `recipeJson` (the serialized current draft) + `message`
// (the instruction); a plain ask arrives as just `message`. The recipe is
// fenced so the model treats it as the form to modify rather than as prose.
// PDF uploads have their own pipeline (see ai-upload.ts); they never reach
// here.
function buildUserText(message?: string, recipeJson?: string): string {
  if (recipeJson) {
    const instruction =
      message?.trim() ||
      "Update the recipe as described and return the complete, modified recipe.";
    return `Here is the current form recipe JSON:\n\n\`\`\`json\n${recipeJson}\n\`\`\`\n\n${instruction}`;
  }
  return (
    message?.trim() ||
    "Convert this uploaded form into a complete, valid recipe."
  );
}

// GET /builder/ai/status
aiRouter.get("/status", async (_req, res) => {
  const available = await isAvailable();
  res.json({
    available,
    message: available ? "AI service is ready" : "AI service not configured",
  });
});

// POST /builder/ai/edit — synchronous text-only AI edits.
//
// Body: { message?, recipeJson? }. At least one must be present.
//   - Edit Form: { message, recipeJson } → modified recipe
//   - Plain ask: { message }             → conversational reply, no recipe
//
// PDF uploads use the separate /builder/ai/upload/* family (see ai-upload.ts).
export async function editHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }

    const { message, recipeJson } = req.body ?? {};
    if (!message && !recipeJson) {
      res.status(400).json({
        error: "Provide at least one of message, recipeJson",
      });
      return;
    }

    const systemPrompt = await buildSystemPrompt();
    const userText = buildUserText(message, recipeJson);

    const reply = await chat(systemPrompt, [
      { role: "user", content: userText },
    ]);
    const recipe = extractRecipe(reply);

    let unresolvableRefs: UnknownRef[] = [];
    if (recipe && Array.isArray((recipe as { steps?: unknown }).steps)) {
      try {
        const catalog = await getFullCatalog();
        unresolvableRefs = collectUnknownRefs(
          recipe as unknown as ServiceContractRecipe,
          catalog,
        );
      } catch (err) {
        console.warn("edit: ref pre-check skipped —", err);
      }
    }

    res.json({ recipe, reply, unresolvableRefs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
aiRouter.post("/edit", editHandler);
