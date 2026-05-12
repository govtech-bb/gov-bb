import * as fs from "fs";
import * as path from "path";
import { EmailTemplateService } from "./email-template.service";
import type { EmailTemplateContext } from "./email-body.builder";

const TEMPLATES_DIR = path.join(__dirname, "templates");

const STUB_CTX: EmailTemplateContext = {
  formTitle: "Test Form",
  submissionId: "sub-test-001",
  submittedAt: "2026-05-12T10:00:00.000Z",
  processedAt: "2026-05-12T10:00:01.000Z",
  sections: [
    {
      title: "Personal Information",
      fields: [
        { label: "First Name", value: "Alice" },
        { label: "Last Name", value: "Smith" },
      ],
    },
    {
      title: "Contact Details",
      fields: [{ label: "Email", value: "alice@example.com" }],
    },
  ],
};

describe("EmailTemplateService", () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
  });

  describe("template loading", () => {
    it("loads every .hbs file from the templates directory", () => {
      const expected = fs
        .readdirSync(TEMPLATES_DIR)
        .filter((f) => f.endsWith(".hbs"))
        .map((f) => path.basename(f, ".hbs"));

      for (const id of expected) {
        expect(service.has(id)).toBe(true);
      }
    });

    it("returns false for an unknown template id", () => {
      expect(service.has("no-such-form")).toBe(false);
    });
  });

  describe("render", () => {
    it("returns null for an unknown template id", () => {
      expect(service.render("no-such-form", {})).toBeNull();
    });

    it("renders submission-confirmation with a structured context", () => {
      const html = service.render(
        "submission-confirmation",
        STUB_CTX as unknown as Record<string, unknown>,
      );

      expect(html).not.toBeNull();
      expect(html).toContain("Test Form");
      expect(html).toContain("Alice");
      expect(html).toContain("Smith");
      expect(html).toContain("sub-test-001");
    });

    it("renders all sections and field rows in the output", () => {
      const html = service.render(
        "submission-confirmation",
        STUB_CTX as unknown as Record<string, unknown>,
      )!;

      expect(html).toContain("Personal Information");
      expect(html).toContain("First Name");
      expect(html).toContain("Contact Details");
      expect(html).toContain("alice@example.com");
    });

    it("renders correctly when sections array is empty", () => {
      const ctx = { ...STUB_CTX, sections: [] };
      const html = service.render(
        "submission-confirmation",
        ctx as unknown as Record<string, unknown>,
      );

      expect(html).not.toBeNull();
      expect(html).toContain("Test Form");
    });

    it("returns null and does not throw when template rendering fails", () => {
      const badService = new EmailTemplateService();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (badService as any).templates.set("submission-confirmation", () => {
        throw new Error("render crash");
      });

      expect(() =>
        badService.render("submission-confirmation", {}),
      ).not.toThrow();
      expect(badService.render("submission-confirmation", {})).toBeNull();
    });
  });
});
