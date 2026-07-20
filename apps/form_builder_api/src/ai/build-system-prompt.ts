import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "../db.js";
import { getSystemPrompt } from "./system-prompt.js";
import { formatCustomComponentList } from "./custom-component-prompt.js";

// Build the system prompt with the live custom components appended. This is the
// one DB read each convert call makes — one extra read per AI action, by design
// (the old per-session prompt cache is gone with the session model).
//
// Shared by both AI entry points so PDF uploads and text edits reference the
// same live component list: routes/ai.ts (runEditBedrock) and
// routes/ai-upload.ts (runBedrock).
export async function buildSystemPrompt(): Promise<string> {
  const ds = await getDataSource();
  const customs = await ds.getRepository(CustomComponent).find();
  // Sanitize-on-read: custom_components rows are untrusted input to the prompt
  // that every AI action reuses (#292).
  const componentList = formatCustomComponentList(customs);

  const basePrompt = getSystemPrompt();
  return componentList
    ? `${basePrompt}\n\n## Live Custom Components (from database)\n${componentList}`
    : basePrompt;
}
