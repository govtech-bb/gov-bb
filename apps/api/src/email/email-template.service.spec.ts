import * as fs from "fs";
import * as path from "path";
import { EmailTemplateService } from "./email-template.service";

/*
 * We test against the real .hbs files that live in
 * apps/api/src/email/templates/ — `__dirname` under ts-jest resolves to the
 * source directory, so path.join(__dirname, 'templates') is the same directory
 * the service itself uses.
 */

const TEMPLATES_DIR = path.join(__dirname, "templates");

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

    it("renders project-protege-mentor with submission values", () => {
      const html = service.render("project-protege-mentor", {
        personal: {
          firstName: "Alice",
          lastName: "Smith",
          dateOfBirth: "1990-01-01",
          employmentStatus: "employed",
        },
        contact: { email: "alice@example.com", phoneNumber: "555-1234" },
        submissionId: "sub-test-001",
        processedAt: "2026-05-08T00:00:00.000Z",
        submittedAt: "2026-05-08T00:00:00.000Z",
      });

      expect(html).not.toBeNull();
      expect(html).toContain("Alice");
      expect(html).toContain("Smith");
      expect(html).toContain("sub-test-001");
    });

    it("renders birth-certificate using the eq helper for title display", () => {
      const html = service.render("birth-certificate", {
        applicant: {
          title: "mr",
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        },
        applyingForYourself: "yes",
        birthDetails: { dateOfBirth: "1985-06-15", placeOfBirth: "Bridgetown" },
        processedAt: "2026-05-08T00:00:00.000Z",
      });

      expect(html).not.toBeNull();
      // eq helper resolves 'mr' → 'Mr'
      expect(html).toContain("Mr");
      expect(html).toContain("John");
    });

    it("returns null and does not throw when template rendering fails", () => {
      // Force a render error by temporarily replacing a compiled template with
      // a function that throws.
      const badService = new EmailTemplateService();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (badService as any).templates.set("project-protege-mentor", () => {
        throw new Error("render crash");
      });

      expect(() =>
        badService.render("project-protege-mentor", {}),
      ).not.toThrow();
      expect(badService.render("project-protege-mentor", {})).toBeNull();
    });
  });
});
