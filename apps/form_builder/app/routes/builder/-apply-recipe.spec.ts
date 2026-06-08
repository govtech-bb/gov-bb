import { buildLoadArgs, draftsEqual } from "./-apply-recipe";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

// ── buildLoadArgs ────────────────────────────────────────────────────────────
// Turns a recipe into the (draft, version) the editor's load path needs. The
// version must come from the recipe itself — a recipe returned by the AI
// assistant has no form summary to read a version from.

describe("buildLoadArgs", () => {
  const catalog = {
    components: [],
    blocks: [],
    custom: [],
  } as unknown as RegistryCatalog;
  const recipe = {
    formId: "passport-renewal",
    title: "Passport Renewal",
    steps: [],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    version: "2.3.0",
  } as unknown as ServiceContractRecipe;

  it("takes the version from the recipe", () => {
    const draft = { steps: [] } as unknown as RecipeDraft;
    const { version } = buildLoadArgs(recipe, catalog, () => draft);
    expect(version).toBe("2.3.0");
  });

  it("deserializes the recipe with the given catalog", () => {
    const draft = { steps: [] } as unknown as RecipeDraft;
    const deserialize = jest.fn(() => draft);
    const result = buildLoadArgs(recipe, catalog, deserialize);
    expect(deserialize).toHaveBeenCalledWith(recipe, catalog);
    expect(result.draft).toBe(draft);
  });
});

// ── draftsEqual ──────────────────────────────────────────────────────────────
// The no-op guard for the AI sidebar: an unchanged recipe must not bump the
// patch version. Equality ignores version, the serialize-stamped timestamps,
// and the editor-only field ids.

type Field = RecipeDraft["steps"][number]["fields"][number];

describe("draftsEqual", () => {
  const draft = (fields: Field[]): RecipeDraft => ({
    formId: "contact",
    title: "Contact",
    steps: [{ stepId: "step-1", title: "Step 1", fields, behaviours: [] }],
  });

  const field = (id: string, ref: string): Field =>
    ({ id, kind: "component", ref, overrides: {} }) as Field;

  it("treats two structurally identical drafts as equal despite differing field ids", () => {
    const a = draft([field("id-aaa", "components/generic-email")]);
    const b = draft([field("id-bbb", "components/generic-email")]);
    expect(draftsEqual(a, b)).toBe(true);
  });

  it("treats a changed field ref as not equal", () => {
    const a = draft([field("id-aaa", "components/generic-email")]);
    const b = draft([field("id-aaa", "components/phone")]);
    expect(draftsEqual(a, b)).toBe(false);
  });

  it("treats a changed field override as not equal", () => {
    const a = draft([field("id-aaa", "components/generic-email")]);
    const withReq = {
      ...field("id-aaa", "components/generic-email"),
      overrides: { required: true },
    } as Field;
    const b = draft([withReq]);
    expect(draftsEqual(a, b)).toBe(false);
  });

  // #958: payment processors are stripped by serializeRecipeDraft (they persist
  // to a DB sibling, not the recipe), so a serialize-only comparison can't see
  // payment edits and the editor would never flag them as unsaved. draftsEqual
  // must compare the in-memory processors directly.
  const paymentDraft = (amount: number): RecipeDraft => ({
    ...draft([]),
    processors: [
      {
        id: "pay-1",
        type: "payment",
        config: {
          provider: "ezpay",
          department: "Treasury",
          paymentCode: "FEE-001",
          amount,
          description: "Fee",
          customerEmailPath: "contact.email",
          customerNamePath: "applicant.full-name",
        },
      },
    ],
  });

  it("treats a changed payment processor config as not equal under comparePayments (#958)", () => {
    expect(
      draftsEqual(paymentDraft(50), paymentDraft(75), {
        comparePayments: true,
      }),
    ).toBe(false);
  });

  it("treats an identical payment processor config as equal under comparePayments (#958)", () => {
    expect(
      draftsEqual(paymentDraft(50), paymentDraft(50), {
        comparePayments: true,
      }),
    ).toBe(true);
  });

  it("ignores the editor-only processor id under comparePayments (#958)", () => {
    const a = paymentDraft(50);
    const b = paymentDraft(50);
    (b.processors![0] as { id: string }).id = "pay-2";
    expect(draftsEqual(a, b, { comparePayments: true })).toBe(true);
  });

  // The AI no-op guard compares the working draft against a deserialized recipe,
  // which never carries payment processors. Without comparePayments, a payment
  // edit must NOT register as a change there (else an echoed-back form reapplies
  // and bumps the version) — payment is the unsaved-changes guard's concern, not
  // this one.
  it("ignores payment processors by default so the AI no-op guard still matches (#958)", () => {
    const working = paymentDraft(50);
    // A recipe round-trips without payment processors at all.
    const deserialized = { ...draft([]), processors: [] };
    expect(draftsEqual(working, deserialized)).toBe(true);
  });
});
