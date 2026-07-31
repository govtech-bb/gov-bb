import { parseWebhookDestinations } from "./webhook-destinations.parser";

describe("parseWebhookDestinations", () => {
  it("parses a valid multi-ministry object", () => {
    const { destinations, issues } = parseWebhookDestinations(
      JSON.stringify({
        youth: { url: "https://youth/api", secret: "y-key" },
        education: { url: "https://edu/api", secret: "e-key" },
      }),
    );
    expect(issues).toEqual([]);
    expect(destinations).toEqual({
      youth: { url: "https://youth/api", secret: "y-key" },
      education: { url: "https://edu/api", secret: "e-key" },
    });
  });

  it.each([undefined, null, "", "   "])(
    "returns empty (no issue) when unset/blank: %p",
    (raw) => {
      const { destinations, issues } = parseWebhookDestinations(raw);
      expect(destinations).toEqual({});
      expect(issues).toEqual([]);
    },
  );

  it("flags invalid JSON without throwing", () => {
    const { destinations, issues } = parseWebhookDestinations("{not json");
    expect(destinations).toEqual({});
    expect(issues).toEqual(["MDA_WEBHOOK_DESTINATIONS is not valid JSON"]);
  });

  it("flags a non-object top level (array)", () => {
    const { destinations, issues } = parseWebhookDestinations("[]");
    expect(destinations).toEqual({});
    expect(issues[0]).toMatch(/must be a JSON object keyed by ministry/);
  });

  it("keeps valid entries and flags invalid ones (partial salvage)", () => {
    const { destinations, issues } = parseWebhookDestinations(
      JSON.stringify({
        youth: { url: "https://youth/api", secret: "y-key" },
        broken: { url: "https://edu/api" }, // missing secret
        blank: { url: "", secret: "" }, // empty
      }),
    );
    expect(destinations).toEqual({
      youth: { url: "https://youth/api", secret: "y-key" },
    });
    expect(issues).toHaveLength(2);
    expect(issues.join("\n")).toMatch(/"broken"/);
    expect(issues.join("\n")).toMatch(/"blank"/);
  });

  it("never leaks a secret value into an issue message", () => {
    const { issues } = parseWebhookDestinations(
      JSON.stringify({ youth: { url: "https://youth/api", secret: 123 } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).not.toContain("123");
  });
});
