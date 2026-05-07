/**
 * Integration test — JSONLogic resolution through the full submission pipeline.
 *
 *  - Author writes processor configs containing JSONLogic rules
 *    (e.g. `{ if: [age >= 60, 0, 25] }`).
 *  - Pipeline resolves rules to literals before dispatch.
 *  - Resolved configs validate against `resolvedProcessorSchema`.
 *  - Each scenario (senior / non-senior / dynamic email recipient) lands the
 *    correct literal value at the processor.
 *
 * Real components: ExpressionsService (registers JSONLogic ops on first
 * construction), the resolution + post-resolution-validation logic itself.
 *
 * Mocked: the processor handlers (we only assert what they receive — not their
 * downstream side-effects).
 */

import { Test } from "@nestjs/testing";
import type { Processor, ResolvedProcessor } from "@govtech-bb/form-types";
import { processorSchema } from "@govtech-bb/form-types";
import { ExpressionsModule } from "../../expressions/expressions.module";
import { ExpressionsService } from "../../expressions/expressions.service";

describe("Expressions pipeline integration", () => {
  let expressions: ExpressionsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ExpressionsModule],
    }).compile();
    expressions = moduleRef.get(ExpressionsService);
  });

  const seniorRateProcessors: Processor[] = [
    {
      type: "payment",
      config: {
        provider: "ezpay",
        department: "civil-registry",
        paymentCode: "BIRTH-CERT",
        amount: {
          if: [
            { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
            0,
            25,
          ],
        } as unknown as number,
        description: "Birth certificate (senior-free)",
        customerEmailPath: "applicant.email",
        customerNamePath: "applicant.name",
      },
    },
    {
      type: "email",
      config: {
        recipientField: { var: "values.path.email" } as unknown as string,
      },
    },
  ];

  it("resolves senior-rate amount to 0 and dynamic recipient to a literal path", () => {
    const out: ResolvedProcessor[] = expressions.resolveProcessors(
      seniorRateProcessors,
      {
        values: {
          applicant: { dob: "1950-01-01", email: "a@b.co" },
          path: { email: "applicant.email" },
        },
      },
    );

    expect(out[0]).toMatchObject({
      type: "payment",
      config: {
        amount: 0,
        paymentCode: "BIRTH-CERT",
        customerEmailPath: "applicant.email",
        customerNamePath: "applicant.name",
      },
    });
    expect(out[1]).toMatchObject({
      type: "email",
      config: { recipientField: "applicant.email" },
    });
  });

  it("resolves non-senior-rate amount to 25", () => {
    const out = expressions.resolveProcessors(seniorRateProcessors, {
      values: {
        applicant: { dob: "2000-01-01", email: "a@b.co" },
        path: { email: "applicant.email" },
      },
    });

    expect((out[0] as ResolvedProcessor).config).toMatchObject({ amount: 25 });
  });

  it("rejects when a rule resolves to a non-numeric amount", () => {
    const broken: Processor[] = [
      {
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          // var resolves to a string, violating resolved schema's number constraint
          amount: { var: "values.bogus" } as unknown as number,
          description: "x",
          customerEmailPath: "applicant.email",
          customerNamePath: "applicant.name",
        },
      },
    ];

    expect(() =>
      expressions.resolveProcessors(broken, {
        values: { bogus: "not-a-number" },
      }),
    ).toThrow(/post-resolution validation/);
  });

  it("preserves processors that have no rules", () => {
    const literalOnly: Processor[] = [
      {
        type: "spreadsheet",
        config: { sheetId: "abc", sheetName: "Submissions" },
      },
    ];

    const out = expressions.resolveProcessors(literalOnly, { values: {} });
    expect(out).toEqual(literalOnly);
  });

  it("rejects routing-path fields configured as JSONLogic rules at author-time", () => {
    // customerEmailPath/customerNamePath are routing, not values — they're
    // not `dynamic()`, so the author-time `processorSchema` must reject rules.
    // (Post-resolution validation can't catch this on its own: a `{ var }`
    // would resolve to a valid string and pass.)
    const result = processorSchema.safeParse({
      type: "payment",
      config: {
        provider: "ezpay",
        department: "civil-registry",
        paymentCode: "BIRTH-CERT",
        amount: 25,
        description: "x",
        customerEmailPath: { var: "values.path" },
        customerNamePath: "applicant.name",
      },
    });
    expect(result.success).toBe(false);
  });

  it("round-trips an explicit amount: 0 (free senior tier)", () => {
    const freeTier: Processor[] = [
      {
        type: "payment",
        config: {
          provider: "ezpay",
          department: "civil-registry",
          paymentCode: "BIRTH-CERT",
          amount: 0,
          description: "Free",
          customerEmailPath: "applicant.email",
          customerNamePath: "applicant.name",
        },
      },
    ];

    const out = expressions.resolveProcessors(freeTier, { values: {} });
    expect((out[0] as ResolvedProcessor).config).toMatchObject({ amount: 0 });
  });
});
