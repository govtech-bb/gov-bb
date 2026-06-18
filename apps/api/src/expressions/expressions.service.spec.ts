import { Test, TestingModule } from "@nestjs/testing";
import type { Processor } from "@govtech-bb/form-types";
import { ExpressionsModule } from "./expressions.module";
import { ExpressionsService } from "./expressions.service";

describe("ExpressionsService", () => {
  let service: ExpressionsService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ExpressionsModule],
    }).compile();
    service = module.get(ExpressionsService);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("resolves a processor config with embedded rules", () => {
    const cfg = {
      to: { var: "values.email" },
      amount: {
        if: [{ ">=": [{ age: [{ var: "values.dob" }] }, 60] }, 0, 25],
      },
    };
    const out = service.resolveConfig(cfg, {
      values: { email: "x@y.z", dob: "1950-01-01" },
    });
    expect(out).toEqual({ to: "x@y.z", amount: 0 });
  });

  it("leaves a config without rules unchanged", () => {
    const cfg = { to: "static@example.com", subject: "Hi" };
    expect(service.resolveConfig(cfg, { values: {} })).toEqual(cfg);
  });

  it("resolves every processor's config independently and validates against resolved schema", () => {
    const processors: Processor[] = [
      {
        type: "email",
        config: {
          recipientField: { var: "values.path" } as unknown as string,
        },
      },
      {
        type: "spreadsheet",
        config: { filename: "static-name" },
      },
    ];

    const out = service.resolveProcessors(processors, {
      values: { path: "personal.email" },
    });

    expect(out).toEqual([
      { type: "email", config: { recipientField: "personal.email" } },
      { type: "spreadsheet", config: { filename: "static-name" } },
    ]);
  });

  it("passes a case-management processor through resolution unchanged", () => {
    // case-management config has no dynamic() fields, so it must survive
    // resolution and validate against resolvedProcessorSchema — otherwise the
    // listener skips ALL non-gating dispatch for the submission (incl. email).
    const processors: Processor[] = [
      { type: "email", config: { recipientField: "applicant.email" } },
      { type: "case-management", config: { programmeCode: "CAMP" } },
    ];

    const out = service.resolveProcessors(processors, { values: {} });

    expect(out).toEqual([
      { type: "email", config: { recipientField: "applicant.email" } },
      { type: "case-management", config: { programmeCode: "CAMP" } },
    ]);
  });

  // Mirrors the get-a-primary-school-textbook-grant 1.7.0 processor batch:
  // an applicant confirmation email plus a school email routed by the shared
  // `child-school` value via the `schoolEmail` op. See issue #1213.
  const textbookGrantProcessors: Processor[] = [
    {
      type: "email",
      config: {
        label: "Applicant Email",
        subject: "Your textbook grant application has been received",
        recipientField: "applicant-details.applicant-email",
      },
    },
    {
      type: "email",
      config: {
        label: "School Email",
        subject: "A textbook grant application has been received",
        recipientField: {
          schoolEmail: { var: "values.child-details.0.child-school" },
        } as unknown as string,
      },
    },
  ];

  it("routes the school email to the mapped address for a selected school (whole batch resolves)", () => {
    const out = service.resolveProcessors(textbookGrantProcessors, {
      values: {
        "child-details": [{ "child-school": "st-george-primary" }],
      },
    });

    expect(out).toEqual([
      {
        type: "email",
        config: {
          label: "Applicant Email",
          subject: "Your textbook grant application has been received",
          // A plain "stepId.fieldId" reference is NOT a JSONLogic rule, so it
          // passes through unchanged here — the email processor resolves it to
          // the applicant's address downstream.
          recipientField: "applicant-details.applicant-email",
        },
      },
      {
        type: "email",
        config: {
          label: "School Email",
          subject: "A textbook grant application has been received",
          // The schoolEmail rule resolves to a literal address at this stage.
          recipientField: "StGeorgePrimary@mes.gov.bb",
        },
      },
    ]);
  });

  it("falls back to a valid address for a forged/unmapped school (batch does not throw, applicant email survives)", () => {
    const out = service.resolveProcessors(textbookGrantProcessors, {
      values: {
        "child-details": [{ "child-school": "not-a-real-school" }],
      },
    });

    // The applicant processor still resolves (its reference passes through)...
    expect(out[0].config).toEqual({
      label: "Applicant Email",
      subject: "Your textbook grant application has been received",
      recipientField: "applicant-details.applicant-email",
    });
    // ...and the school email resolves to a non-empty fallback address rather
    // than an empty string (which would fail the resolved schema and drop the
    // entire batch, including the applicant confirmation).
    expect(out[1].config).toEqual({
      label: "School Email",
      subject: "A textbook grant application has been received",
      recipientField: "testing@govtech.bb",
    });
  });

  it("throws when a resolved config violates the resolved schema (e.g. amount is not a number)", () => {
    const processors: Processor[] = [
      {
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          // Rule resolves to "not-a-number" — should fail post-resolution validation
          amount: { var: "values.amount" } as unknown as number,
          description: "fee",
          customerEmailPath: "personal.email",
          customerNamePath: "personal.name",
        },
      },
    ];

    expect(() =>
      service.resolveProcessors(processors, {
        values: { amount: "not-a-number" },
      }),
    ).toThrow(/post-resolution validation/);
  });
});
