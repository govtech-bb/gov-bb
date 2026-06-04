import {
  mergeDbProcessors,
  extractDbProcessors,
  firstIncompletePaymentProcessor,
} from "./processor-config";
import type { Processor } from "@govtech-bb/form-types";
import type { RecipeProcessorDraft } from "./types";

const paymentConfig = {
  provider: "ezpay" as const,
  department: "Treasury",
  paymentCode: "FEE-001",
  amount: 50,
  description: "Application fee",
  customerEmailPath: "applicant.email",
  customerNamePath: "applicant.fullName",
};

const emailDraft: RecipeProcessorDraft = {
  id: "e1",
  type: "email",
  config: { recipientField: "applicant.email" },
};

// Deterministic id minter for assertions.
function seqMinter() {
  let n = 0;
  return () => `gen-${++n}`;
}

describe("mergeDbProcessors", () => {
  it("combines recipe non-payment processors with DB payment processors", () => {
    const db: Processor[] = [{ type: "payment", config: paymentConfig }];
    const merged = mergeDbProcessors([emailDraft], db, seqMinter());
    expect(merged).toEqual([
      emailDraft,
      { id: "gen-1", type: "payment", config: paymentConfig },
    ]);
  });

  it("mints a fresh editor id for each DB processor", () => {
    const db: Processor[] = [{ type: "payment", config: paymentConfig }];
    const merged = mergeDbProcessors(undefined, db, seqMinter());
    expect(merged?.[0].id).toBe("gen-1");
  });

  it("prefers DB payment over a recipe payment (no duplication)", () => {
    const recipePayment: RecipeProcessorDraft = {
      id: "p-old",
      type: "payment",
      config: { ...paymentConfig, department: "StaleFromRecipe" },
    };
    const db: Processor[] = [{ type: "payment", config: paymentConfig }];
    const merged = mergeDbProcessors(
      [emailDraft, recipePayment],
      db,
      seqMinter(),
    );
    const payments = merged?.filter((p) => p.type === "payment");
    expect(payments).toHaveLength(1);
    expect(payments?.[0].config).toEqual(paymentConfig);
  });

  it("lifts a recipe payment processor into the editor when the DB has none (#750 migration)", () => {
    const recipePayment: RecipeProcessorDraft = {
      id: "p-old",
      type: "payment",
      config: paymentConfig,
    };
    const merged = mergeDbProcessors(
      [emailDraft, recipePayment],
      null,
      seqMinter(),
    );
    expect(merged).toEqual([emailDraft, recipePayment]);
  });

  it("returns undefined when both sources are absent (preserves absent-vs-empty)", () => {
    expect(mergeDbProcessors(undefined, null, seqMinter())).toBeUndefined();
  });

  it("returns an empty array when the recipe had an explicit empty array and DB is null", () => {
    expect(mergeDbProcessors([], null, seqMinter())).toEqual([]);
  });

  it("filters a non-payment DB entry out of the payment slice (no duplicate non-payment processor)", () => {
    // A stray non-payment processor in the DB blob must never re-enter the
    // editor as a payment-slice member — only the recipe owns non-payment
    // processors, so the recipe's email must appear exactly once.
    const dbEmail: Processor = {
      type: "email",
      config: { recipientField: "applicant.email" },
    };
    const db: Processor[] = [
      dbEmail,
      { type: "payment", config: paymentConfig },
    ];
    const merged = mergeDbProcessors([emailDraft], db, seqMinter());

    const emails = merged?.filter((p) => p.type === "email");
    expect(emails).toEqual([emailDraft]);
    const payments = merged?.filter((p) => p.type === "payment");
    expect(payments).toEqual([
      { id: "gen-1", type: "payment", config: paymentConfig },
    ]);
  });

  it("lifts the recipe payment when the DB has only non-payment entries (filtered set is empty)", () => {
    // The DB has a non-payment entry but no payment one, so the lift condition
    // must be decided on the FILTERED set: the recipe payment is migrated in.
    const recipePayment: RecipeProcessorDraft = {
      id: "p-old",
      type: "payment",
      config: paymentConfig,
    };
    const dbEmail: Processor = {
      type: "email",
      config: { recipientField: "applicant.email" },
    };
    const merged = mergeDbProcessors(
      [emailDraft, recipePayment],
      [dbEmail],
      seqMinter(),
    );
    expect(merged).toEqual([emailDraft, recipePayment]);
  });
});

describe("extractDbProcessors", () => {
  it("returns the payment processors with editor ids stripped", () => {
    const processors: RecipeProcessorDraft[] = [
      emailDraft,
      { id: "p1", type: "payment", config: paymentConfig },
    ];
    expect(extractDbProcessors(processors)).toEqual([
      { type: "payment", config: paymentConfig },
    ]);
  });

  it("returns null when there are no payment processors", () => {
    expect(extractDbProcessors([emailDraft])).toBeNull();
  });

  it("returns null for an undefined processors list", () => {
    expect(extractDbProcessors(undefined)).toBeNull();
  });
});

describe("firstIncompletePaymentProcessor", () => {
  it("returns null when there are no payment processors", () => {
    expect(firstIncompletePaymentProcessor([emailDraft])).toBeNull();
  });

  it("returns null for an undefined list", () => {
    expect(firstIncompletePaymentProcessor(undefined)).toBeNull();
  });

  it("returns null when every payment processor is complete", () => {
    const processors: RecipeProcessorDraft[] = [
      emailDraft,
      { id: "p1", type: "payment", config: paymentConfig },
    ];
    expect(firstIncompletePaymentProcessor(processors)).toBeNull();
  });

  it("returns the index of an incomplete payment processor (empty seeded fields)", () => {
    const processors: RecipeProcessorDraft[] = [
      emailDraft,
      {
        id: "p1",
        type: "payment",
        // What makeDefaultProcessor("payment") seeds: empty strings the API 400s.
        config: {
          provider: "ezpay",
          department: "",
          paymentCode: "",
          amount: 0,
          description: "",
          customerEmailPath: "",
          customerNamePath: "",
        },
      },
    ];
    expect(firstIncompletePaymentProcessor(processors)).toBe(1);
  });

  it("returns the first incomplete payment processor when several exist", () => {
    const processors: RecipeProcessorDraft[] = [
      { id: "ok", type: "payment", config: paymentConfig },
      {
        id: "bad",
        type: "payment",
        config: { ...paymentConfig, department: "" },
      },
    ];
    expect(firstIncompletePaymentProcessor(processors)).toBe(1);
  });
});
