import { parseStatsCommand, suggestFormIds, usageText } from "./stats-command";

describe("parseStatsCommand", () => {
  it("reads a period on its own", () => {
    expect(parseStatsCommand("week")).toEqual({
      kind: "stats",
      period: "week",
    });
  });

  it("reads a period and a form id, ignoring case and spacing", () => {
    expect(parseStatsCommand("  Month   Passport-Renewal ")).toEqual({
      kind: "stats",
      period: "month",
      formId: "passport-renewal",
    });
  });

  it.each(["", "help", "year", "week a b"])("asks for help on %j", (text) => {
    expect(parseStatsCommand(text)).toEqual({ kind: "help" });
  });
});

describe("usageText", () => {
  it("uses the command name Slack sent", () => {
    expect(usageText("/govstats")).toContain(
      "`/govstats <today|week|month> [form-id]`",
    );
  });
});

describe("suggestFormIds", () => {
  const ids = ["passport-renewal", "birth-certificate", "death-certificate"];

  it("matches on a shared word", () => {
    expect(suggestFormIds("certificate", ids)).toEqual([
      "birth-certificate",
      "death-certificate",
    ]);
  });

  it("matches a partial id", () => {
    expect(suggestFormIds("passport", ids)).toEqual(["passport-renewal"]);
  });

  it("returns nothing for an unrelated term", () => {
    expect(suggestFormIds("zzz", ids)).toEqual([]);
  });
});
