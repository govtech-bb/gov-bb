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
// tweak arrives as `recipeJson` (the serialized current draft) + `message` (the
// instruction); an Upload arrives as `pdfBase64` with no recipe. The recipe is
// fenced so the model treats it as the form to modify rather than as prose.
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

// POST /builder/ai/convert — the one AI endpoint.
//
// Body: { message?, recipeJson?, pdfBase64? }. At least one must be present.
//   - Edit Form:  { message, recipeJson }  → modified recipe
//   - Upload:     { pdfBase64 }            → converted recipe
// Returns { recipe: <recipe>|null, reply: <assistant text>, unresolvableRefs }.
// `recipe` is null when the model replies conversationally without emitting a
// recipe; the editor surfaces `reply` and leaves the draft untouched in that
// case. `unresolvableRefs` lists any refs in the emitted recipe that don't
// resolve against the full catalog (a hallucinated/renamed component) — the
// editor warns but still loads the draft so the author can fix them in place;
// Deploy stays the hard gate (#504).
//
// PDF is sent inline as base64. The Amplify SSR Lambda caps requests at ~6 MB,
// so the SSR client guards uploads at 4 MB. (A presigned-S3 path once lived here
// for lifting that cap; it was tied to the session model and removed with it.)
export async function convertHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }

    const { message, recipeJson, pdfBase64 } = req.body ?? {};
    if (!message && !recipeJson && !pdfBase64) {
      res.status(400).json({
        error: "Provide at least one of message, recipeJson, or pdfBase64",
      });
      return;
    }

    const systemPrompt = await buildSystemPrompt();
    const userText = buildUserText(message, recipeJson);
    const pdfPages = pdfBase64 ? [pdfBase64] : undefined;

    const reply = await chat(
      systemPrompt,
      [{ role: "user", content: userText }],
      pdfPages,
    );
    const recipe = extractRecipe(reply);

    // If the model emitted a recipe, flag refs that don't resolve against the
    // full catalog (builtins + registry + live custom components). The editor
    // surfaces these as a non-blocking warning and still loads the draft.
    let unresolvableRefs: UnknownRef[] = [];
    if (recipe && Array.isArray((recipe as { steps?: unknown }).steps)) {
      const catalog = await getFullCatalog();
      unresolvableRefs = collectUnknownRefs(
        recipe as unknown as ServiceContractRecipe,
        catalog,
      );
    }

    res.json({ recipe, reply, unresolvableRefs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
aiRouter.post("/convert", convertHandler);
