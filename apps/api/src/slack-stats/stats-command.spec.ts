import { TOOLS } from "@govtech-bb/umami-analytics";
import { RecipeFileLoaderService } from "@/forms/form-definitions/recipe-file-loader.service";
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

  it("mentions the chat report", () => {
    expect(usageText("/stats")).toContain("`/stats week chat`");
  });

  it("mentions the journeys report", () => {
    expect(usageText("/stats")).toContain("`/stats week journeys`");
  });

  it("mentions the search report", () => {
    expect(usageText("/stats")).toContain("`/stats week search`");
  });
});

describe("usageText — tools", () => {
  it("lists every tool ID", () => {
    const text = usageText("/stats");
    expect(text).toContain("`/stats week crop-over-permits`");
    for (const { id } of TOOLS) expect(text).toContain(`\`${id}\``);
  });
});

describe("the word after the period", () => {
  // `/stats <period> <word>` reads the word as a topic, then a tool ID, then a
  // form ID, so a form with one of those IDs could never be reported on.
  it("is never both a form ID and a tool ID or topic", async () => {
    // The recipe files the API serves forms from (RECIPE_SOURCE is always
    // "files" outside development), public or not.
    const loader = new RecipeFileLoaderService();
    await loader.loadAll();
    const formIds = loader.findAll().map((f) => f.formId);
    expect(formIds.length).toBeGreaterThan(10);

    const taken = new Set<string>([
      ...TOOLS.map((t) => t.id),
      "tools",
      "journeys",
      "search",
      "chat",
    ]);
    expect(formIds.filter((id) => taken.has(id))).toEqual([]);
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

  it("never suggests the word itself", () => {
    expect(suggestFormIds("search", ["search", "research-grant"])).toEqual([
      "research-grant",
    ]);
  });

  it("returns nothing for an unrelated term", () => {
    expect(suggestFormIds("zzz", ids)).toEqual([]);
  });
});
