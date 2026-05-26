import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let _cached: string | null = null;

export function getSystemPrompt(): string {
  if (_cached) return _cached;

  // Try to load from the form_builder app's prompts directory
  const mdPath = resolve(
    process.cwd(),
    "../form_builder/app/server/ai-builder/prompts/system-prompt.md",
  );
  if (existsSync(mdPath)) {
    _cached = readFileSync(mdPath, "utf8");
    return _cached;
  }

  // Fallback: minimal prompt
  _cached = `You are an AI assistant that helps create digital government forms.
When given a description or PDF of a form, generate a JSON recipe with formId, title, version, steps, and elements.
Each step has a stepId, title, and elements array. Each element has a ref (component reference) and overrides (fieldId, label, etc).`;
  return _cached;
}
