/**
 * Parses the first fenced JSON block in an AI response. Returns the parsed
 * value when it satisfies `predicate`, otherwise null (no block, invalid JSON,
 * or predicate rejects). Each caller supplies its own post-parse guard.
 */
export function extractFirstJsonBlock<T = unknown>(
  text: string,
  predicate: (parsed: any) => boolean,
): T | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (!codeBlockMatch) return null;
  try {
    const parsed = JSON.parse(codeBlockMatch[1]);
    if (predicate(parsed)) return parsed as T;
  } catch {
    // Not valid JSON in code block
  }
  return null;
}

/**
 * Extracts a JSON recipe from an AI assistant's text response.
 * Looks for JSON blocks containing formId and steps.
 */
export function extractRecipe(text: string): Record<string, any> | null {
  const isRecipe = (parsed: any) => parsed && parsed.formId && parsed.steps;

  const fromBlock = extractFirstJsonBlock<Record<string, any>>(text, isRecipe);
  if (fromBlock) return fromBlock;

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*"formId"[\s\S]*"steps"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isRecipe(parsed)) return parsed;
    } catch {
      // Not valid JSON
    }
  }

  return null;
}
