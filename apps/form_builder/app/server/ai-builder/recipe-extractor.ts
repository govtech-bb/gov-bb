/**
 * Try to extract a JSON recipe from an assistant response.
 * Tries fenced JSON blocks, fenced code blocks, then the largest brace-balanced
 * substring that contains "formId" and "steps".
 */
export function extractRecipe(text: string): Record<string, any> | null {
  // Strategy 1: ```json ... ``` fenced blocks
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    const parsed = tryParseRecipe(match[1]);
    if (parsed) return parsed;
  }

  // Strategy 2: ``` ... ``` fenced blocks (no language tag)
  const codeBlockRegex = /```\s*([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const parsed = tryParseRecipe(match[1]);
    if (parsed) return parsed;
  }

  // Strategy 3: brace-balanced search for an object containing "formId" and "steps"
  const bracePositions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") bracePositions.push(i);
  }
  for (const start of bracePositions) {
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end > start) {
      const candidate = text.substring(start, end);
      if (candidate.includes('"formId"') && candidate.includes('"steps"')) {
        const parsed = tryParseRecipe(candidate);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

function tryParseRecipe(text: string): Record<string, any> | null {
  try {
    let cleaned = text.trim();
    if (cleaned.includes("$recipe$")) {
      const start = cleaned.indexOf("$recipe$") + "$recipe$".length;
      const end = cleaned.lastIndexOf("$recipe$");
      if (end > start) cleaned = cleaned.substring(start, end).trim();
    }
    if (cleaned.toUpperCase().startsWith("INSERT")) {
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
    }
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.formId &&
      parsed.steps &&
      Array.isArray(parsed.steps)
    ) {
      return parsed;
    }
  } catch {
    /* not valid JSON */
  }
  return null;
}
