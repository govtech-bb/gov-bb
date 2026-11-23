import {
  STATS_PERIODS,
  TOOLS,
  type StatsPeriod,
} from "@govtech-bb/umami-analytics";

/** The words that go in place of a form ID for a topic reply (#3804). */
export const STATS_TOPICS = ["tools", "journeys", "search", "chat"];

export type StatsCommand =
  | { kind: "stats"; period: StatsPeriod; formId?: string }
  | { kind: "help" };

/** Parse the slash command's text: `<today|week|month> [form-id]`. */
export function parseStatsCommand(text: string): StatsCommand {
  const [period, formId, ...rest] = text.trim().toLowerCase().split(/\s+/);
  if (rest.length > 0 || !STATS_PERIODS.includes(period as StatsPeriod)) {
    return { kind: "help" };
  }
  return formId
    ? { kind: "stats", period: period as StatsPeriod, formId }
    : { kind: "stats", period: period as StatsPeriod };
}

export function usageText(command: string): string {
  return [
    `*Usage:* \`${command} <today|week|month> [form-id]\``,
    "• `today`: today so far, compared with yesterday",
    "• `week`: last Monday to Sunday, compared with the week before",
    "• `month`: last calendar month, compared with the month before",
    `Add a form ID for one form, for example \`${command} week passport-renewal\`.`,
    `Add a tool ID for one tool, for example \`${command} week crop-over-permits\`. Tool IDs: ${TOOLS.map((t) => `\`${t.id}\``).join(", ")}.`,
    `Add \`chat\` for the chat questions asked on landing, for example \`${command} week chat\`.`,
  ].join("\n");
}

/** Up to 5 known IDs (forms, tools, topics) that look like `term`, for a "did you mean" reply. */
export function suggestFormIds(term: string, ids: string[]): string[] {
  const words = term.split("-").filter((w) => w.length > 2);
  return ids
    .filter(
      (id) =>
        id.includes(term) ||
        term.includes(id) ||
        words.some((w) => id.includes(w)),
    )
    .slice(0, 5);
}
