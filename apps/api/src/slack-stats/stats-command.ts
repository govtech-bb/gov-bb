import { STATS_PERIODS, type StatsPeriod } from "@govtech-bb/umami-analytics";

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
  ].join("\n");
}

/** Up to 5 known form IDs that look like `term`, for a "did you mean" reply. */
export function suggestFormIds(term: string, formIds: string[]): string[] {
  const words = term.split("-").filter((w) => w.length > 2);
  return formIds
    .filter(
      (id) =>
        id.includes(term) ||
        term.includes(id) ||
        words.some((w) => id.includes(w)),
    )
    .slice(0, 5);
}
