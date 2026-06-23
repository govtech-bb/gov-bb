/**
 * Extracts a JSON recipe from an AI assistant's text response.
 * Looks for JSON blocks containing formId and steps.
 */
export function extractRecipe(text: string): Record<string, any> | null {
  // Try to find JSON in code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed.formId && parsed.steps) return parsed;
    } catch {
      // Not valid JSON in code block
    }
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*"formId"[\s\S]*"steps"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.formId && parsed.steps) return parsed;
    } catch {
      // Not valid JSON
    }
  }

  return null;
}
