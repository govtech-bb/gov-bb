import { submissionActionSummary } from "./submission-actions";

const webhook = (config: Record<string, unknown>) =>
  submissionActionSummary({ type: "webhook", config });

describe("submissionActionSummary — webhook", () => {
  it("names CaMS and shows the programme and reference codes", () => {
    expect(
      webhook({
        mapping: {
          programmeCode: "passport-renewal",
          mdaCode: "MOH",
          programmeShortCode: "PR",
        },
      }),
    ).toEqual({
      title: "Send to Case Management System (CaMS)",
      description: "Programme passport-renewal (MOH-PR)",
    });
  });

  it("leaves the reference codes out when the short code is missing", () => {
    expect(
      webhook({
        mapping: { programmeCode: "passport-renewal", mdaCode: "MOH" },
      }).description,
    ).toBe("Programme passport-renewal");
  });

  it("asks for a programme code when it is blank or whitespace", () => {
    expect(webhook({ mapping: { programmeCode: "" } })).toEqual({
      title: "Send to Case Management System (CaMS)",
      description: "Enter a programme code",
    });
    expect(webhook({ mapping: { programmeCode: "  " } })).toEqual({
      title: "Send to Case Management System (CaMS)",
      description: "Enter a programme code",
    });
  });

  it("shows the host of a custom webhook URL", () => {
    expect(webhook({ url: "https://example.com/hooks/forms?x=1" })).toEqual({
      title: "Send to webhook",
      description: "example.com",
    });
  });

  it.each([{}, { url: 42 }, { url: "not a url" }])(
    "falls back to generic text when the URL is unusable (%o)",
    (config) => {
      expect(webhook(config)).toEqual({
        title: "Send to webhook",
        description: "Send submission data through a webhook",
      });
    },
  );
});
