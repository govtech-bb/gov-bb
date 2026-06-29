import * as fs from "fs";

// Spread-clone the real module so its exports become configurable —
// vi.spyOn cannot redefine properties on a sealed ESM namespace.
vi.mock("fs", async () => ({
  ...(await vi.importActual<typeof import("fs")>("fs")),
}));
import * as path from "path";
import { EmailTemplateService } from "./email-template.service";
import type { EmailTemplateContext } from "./email-body.builder";

const TEMPLATES_DIR = path.join(__dirname, "templates");

const STUB_CTX: EmailTemplateContext = {
  formTitle: "Test Form",
  submissionId: "sub-test-001",
  submittedAt: "2026-05-12T10:00:00.000Z",
  submittedDate: "12/05/2026",
  submittedTime: "06:00",
  processedAt: "2026-05-12T10:00:01.000Z",
  year: "2026",
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

  describe("template loading — edge cases", () => {
    it("warns and returns without loading when the templates directory does not exist", () => {
      const warnSpy = vi
        .spyOn((service as any).logger, "warn")
        .mockImplementation(() => {});
      (service as any).loadTemplates("/nonexistent-path-xyz");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
      warnSpy.mockRestore();
    });

    it("logs an error and skips the template when readFileSync throws", () => {
      const errorSpy = vi
        .spyOn((service as any).logger, "error")
        .mockImplementation(() => {});
      const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValueOnce(true);
      const readdirSpy = vi
        .spyOn(fs, "readdirSync")
        .mockReturnValueOnce(["bad-template.hbs"] as never);
      const readFileSpy = vi
        .spyOn(fs, "readFileSync")
        .mockImplementationOnce(() => {
          throw new Error("EACCES: permission denied");
        });

      (service as any).loadTemplates("/fake-dir");

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("bad-template"),
        expect.any(Error),
      );
      errorSpy.mockRestore();
      existsSpy.mockRestore();
      readdirSpy.mockRestore();
      readFileSpy.mockRestore();
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

    it("renders the payment block on submission-confirmation when payment is present", () => {
      const ctx = {
        ...STUB_CTX,
        payment: { amountReceived: "$50.00", transactionId: "TXN-1" },
      };
      const html = service.render(
        "submission-confirmation",
        ctx as unknown as Record<string, unknown>,
      )!;

      expect(html).toContain("Payment amount received:");
      expect(html).toContain("$50.00");
      expect(html).toContain("EzPay transaction ID:");
      expect(html).toContain("TXN-1");
    });

    it("omits the payment block on submission-confirmation when payment is absent", () => {
      const html = service.render(
        "submission-confirmation",
        STUB_CTX as unknown as Record<string, unknown>,
      )!;

      expect(html).not.toContain("Payment amount received:");
    });

    it("renders payment-required with the amount due and pay link", () => {
      const html = service.render("payment-required", {
        formTitle: "Birth Certificate",
        referenceCode: "BC-20260617-000001",
        amountDue: "$5.00",
        description: "Birth Certificate - 1 copy",
        paymentUrl: "https://ezpay.example/pay?token=abc",
        year: "2026",
      });

      expect(html).not.toBeNull();
      expect(html).toContain("Birth Certificate");
      expect(html).toContain("Payment required");
      expect(html).toContain("$5.00");
      expect(html).toContain("BC-20260617-000001");
      // Handlebars HTML-escapes `=` (→ &#x3D;) in {{paymentUrl}}; correct for an
      // href, so assert on the un-escaped prefix.
      expect(html).toContain("https://ezpay.example/pay?token");
      expect(html).toContain("Pay now");
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
