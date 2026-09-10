"use client";
import { useContext, useCallback } from "react";
import { ShikiContext } from "./context";
import { normalizeLanguage } from "./provider";
import type { UseShikiHighlighterResult } from "./types";
export function useShikiHighlighter(): UseShikiHighlighterResult {
  const context = useContext(ShikiContext);
  if (!context) {
    throw new Error(
      "useShikiHighlighter must be used within a ShikiProvider. " +
        "Wrap your app with the local <ShikiProvider> from components/ui/code-highlighted.",
    );
  }
  const { highlighter, isLoading, error, languages, labels } = context;
  const highlight = useCallback(
    (code: string, lang: string): string | null => {
      if (!highlighter) {
        return null;
      }
      // Normalize language aliases (e.g., 'js' -> 'javascript')
      const normalizedLang = normalizeLanguage(lang);
      // Check if the language is supported
      if (!normalizedLang || !languages.includes(normalizedLang)) {
        console.warn(
          `[CodeHighlighted] Language "${lang}" is not in the ShikiProvider's languages list. ` +
            `Add it to the languages array: languages={[...existing, '${normalizedLang || lang}']}. ` +
            `Rendering as plain text.`,
        );
        return null;
      }
      try {
        // Use dual theme for light/dark mode support with hardcoded themes
        const html = highlighter.codeToHtml(code, {
          lang: normalizedLang,
          themes: {
            light: "github-light",
            dark: "vesper",
          },
        });
        return html;
      } catch (err) {
        console.warn(
          `[CodeHighlighted] Failed to highlight code with language "${lang}":`,
          err,
        );
        return null;
      }
    },
    [highlighter, languages],
  );
  return {
    highlight,
    isLoading,
    isReady: !isLoading && highlighter !== null,
    error,
    labels,
  };
}
