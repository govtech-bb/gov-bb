import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "../db.js";
import { getSystemPrompt } from "./system-prompt.js";
import { formatCustomComponentList } from "./custom-component-prompt.js";

// Registry entries are untrusted data, sanitized before they join the prompt.
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
