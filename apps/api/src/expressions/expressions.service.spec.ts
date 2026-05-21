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
        config: { sheetId: "static-id" },
      },
    ];

    const out = service.resolveProcessors(processors, {
      values: { path: "personal.email" },
    });

    expect(out).toEqual([
      { type: "email", config: { recipientField: "personal.email" } },
      { type: "spreadsheet", config: { sheetId: "static-id" } },
    ]);
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
