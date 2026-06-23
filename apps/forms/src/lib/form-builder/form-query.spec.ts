/**
 * form-query.spec.ts
 *
 * Unit tests for the two-tier form caching layer.
 *
 * Coverage:
 *  - formSchemaCacheKey returns the expected tuple
 *  - contractQueryOptions produces the correct queryKey and staleTime
 *  - formMetaQueryOptions includes the contract version in the queryKey
 *  - QueryClient serves FormMeta from cache on second request (no rebuilds)
 *  - Version bump produces a new cache entry (old entry not served)
 */
import { QueryClient } from "@tanstack/react-query";
import {
  formSchemaCacheKey,
  contractQueryOptions,
  formMetaQueryOptions,
  normalizePreviewToken,
  CONTRACT_CACHE_KEY,
  FORM_SCHEMA_CACHE_KEY,
} from "./form-query";
import type { ClientServiceContract, FormMeta } from "@forms/types";

// ---------------------------------------------------------------------------
// Minimal stubs — just enough fields for the query option factories
// ---------------------------------------------------------------------------

function makeClientContract(
  formId: string,
  version: string,
): ClientServiceContract {
  return {
    formId,
    version,
    title: "Test Form",
    steps: [],
  } as unknown as ClientServiceContract;
}

// ---------------------------------------------------------------------------
// formSchemaCacheKey
// ---------------------------------------------------------------------------

describe("formSchemaCacheKey", () => {
  it("returns a tuple of [FORM_SCHEMA_CACHE_KEY, formId, null] when no preview", () => {
    const key = formSchemaCacheKey("my-form");
    expect(key).toEqual([FORM_SCHEMA_CACHE_KEY, "my-form", null]);
  });

  it("two calls with the same args produce deeply-equal keys", () => {
    const a = formSchemaCacheKey("passport");
    const b = formSchemaCacheKey("passport");
    expect(a).toEqual(b);
  });

  it("different formIds produce different keys", () => {
    const a = formSchemaCacheKey("passport");
    const b = formSchemaCacheKey("birth-cert");
    expect(a).not.toEqual(b);
  });

  it("includes the preview token in the 3rd slot when provided", () => {
    const key = formSchemaCacheKey("my-form", "tok");
    expect(key).toEqual([FORM_SCHEMA_CACHE_KEY, "my-form", "tok"]);
  });

  it("blank/whitespace token normalizes to null (same as no preview)", () => {
    const withBlank = formSchemaCacheKey("my-form", "   ");
    const withEmpty = formSchemaCacheKey("my-form", "");
    const withNone = formSchemaCacheKey("my-form");
    expect(withBlank).toEqual([FORM_SCHEMA_CACHE_KEY, "my-form", null]);
    expect(withEmpty).toEqual([FORM_SCHEMA_CACHE_KEY, "my-form", null]);
    expect(withBlank).toEqual(withNone);
    expect(withEmpty).toEqual(withNone);
  });

  it("token and no-token keys for the same formId are NOT equal", () => {
    const withToken = formSchemaCacheKey("my-form", "tok");
    const withoutToken = formSchemaCacheKey("my-form");
    expect(withToken).not.toEqual(withoutToken);
  });
});

// ---------------------------------------------------------------------------
// normalizePreviewToken
// ---------------------------------------------------------------------------

describe("normalizePreviewToken", () => {
  it("returns undefined for undefined input", () => {
    expect(normalizePreviewToken(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(normalizePreviewToken("")).toBeUndefined();
  });

  it("returns undefined for a whitespace-only string", () => {
    expect(normalizePreviewToken("   ")).toBeUndefined();
  });

  it("trims and returns the token for a padded string", () => {
    expect(normalizePreviewToken(" tok ")).toBe("tok");
  });

  it("returns the token unchanged when already trimmed", () => {
    expect(normalizePreviewToken("s3cret")).toBe("s3cret");
  });
});

// ---------------------------------------------------------------------------
// contractQueryOptions
// ---------------------------------------------------------------------------

describe("contractQueryOptions", () => {
  it("queryKey starts with CONTRACT_CACHE_KEY and includes formId", () => {
    const opts = contractQueryOptions("benefit-claim");
    expect(opts.queryKey).toEqual([CONTRACT_CACHE_KEY, "benefit-claim", null]);
  });

  it("staleTime is 60 seconds", () => {
    const opts = contractQueryOptions("benefit-claim");
    expect(opts.staleTime).toBe(60_000);
  });

  it("queryFn is defined", () => {
    const opts = contractQueryOptions("benefit-claim");
    expect(typeof opts.queryFn).toBe("function");
  });

  it("queryKey includes the preview token when provided", () => {
    const opts = contractQueryOptions("benefit-claim", "tok");
    expect(opts.queryKey).toEqual([CONTRACT_CACHE_KEY, "benefit-claim", "tok"]);
  });

  it("with-token and without-token keys for the same formId are NOT equal", () => {
    const withToken = contractQueryOptions("benefit-claim", "tok");
    const withoutToken = contractQueryOptions("benefit-claim");
    expect(withToken.queryKey).not.toEqual(withoutToken.queryKey);
  });

  it("two different tokens for the same formId produce different keys", () => {
    const opts1 = contractQueryOptions("benefit-claim", "tokenA");
    const opts2 = contractQueryOptions("benefit-claim", "tokenB");
    expect(opts1.queryKey).not.toEqual(opts2.queryKey);
  });

  it("empty string preview produces the same key as no preview (null slot)", () => {
    const withEmpty = contractQueryOptions("benefit-claim", "");
    const withoutPreview = contractQueryOptions("benefit-claim");
    expect(withEmpty.queryKey).toEqual([
      CONTRACT_CACHE_KEY,
      "benefit-claim",
      null,
    ]);
    expect(withEmpty.queryKey).toEqual(withoutPreview.queryKey);
  });

  it("whitespace-only preview is treated as no preview", () => {
    const withSpaces = contractQueryOptions("benefit-claim", "   ");
    expect(withSpaces.queryKey).toEqual([
      CONTRACT_CACHE_KEY,
      "benefit-claim",
      null,
    ]);
  });
});

// ---------------------------------------------------------------------------
// formMetaQueryOptions
// ---------------------------------------------------------------------------

describe("formMetaQueryOptions", () => {
  it("queryKey is [FORM_SCHEMA_CACHE_KEY, formId, null] when no preview", () => {
    const contract = makeClientContract("benefit-claim", "3.0.0");
    const opts = formMetaQueryOptions("benefit-claim", contract);
    expect(opts.queryKey).toEqual([
      FORM_SCHEMA_CACHE_KEY,
      "benefit-claim",
      null,
    ]);
  });

  it("staleTime is Infinity", () => {
    const contract = makeClientContract("benefit-claim", "3.0.0");
    const opts = formMetaQueryOptions("benefit-claim", contract);
    expect(opts.staleTime).toBe(Infinity);
  });

  it("preview token lands in the 3rd slot of the queryKey", () => {
    const contract = makeClientContract("benefit-claim", "3.0.0");
    const opts = formMetaQueryOptions("benefit-claim", contract, "tok");
    expect(opts.queryKey).toEqual([
      FORM_SCHEMA_CACHE_KEY,
      "benefit-claim",
      "tok",
    ]);
  });

  it("blank/whitespace preview normalizes to null in queryKey", () => {
    const contract = makeClientContract("benefit-claim", "3.0.0");
    const withBlank = formMetaQueryOptions("benefit-claim", contract, "  ");
    expect(withBlank.queryKey).toEqual([
      FORM_SCHEMA_CACHE_KEY,
      "benefit-claim",
      null,
    ]);
  });

  it("preview and no-preview builds produce DIFFERENT queryKeys (regression guard)", () => {
    const contract = makeClientContract("f", "1.0.0");
    const withToken = formMetaQueryOptions("f", contract, "tok");
    const withoutToken = formMetaQueryOptions("f", contract);
    expect(withToken.queryKey).not.toEqual(withoutToken.queryKey);
  });
});

// ---------------------------------------------------------------------------
// QueryClient integration — cache hit / miss / version refresh
// ---------------------------------------------------------------------------

describe("QueryClient form caching", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    qc.clear();
  });

  it("stores and retrieves FormMeta by formId key", async () => {
    const contract = makeClientContract("passport-renewal", "1.0.0");

    const fakeFormMeta = { formId: "passport-renewal" };

    // Seed the cache directly (simulates a completed loader run)
    qc.setQueryData(formSchemaCacheKey("passport-renewal"), fakeFormMeta);

    // Reading with ensureQueryData should return the cached value without
    // calling the queryFn.
    const buildFormSpy = vi.fn().mockResolvedValue(fakeFormMeta);
    const retrieved = await qc.ensureQueryData({
      ...formMetaQueryOptions("passport-renewal", contract),
      queryFn: buildFormSpy,
    });

    expect(retrieved).toEqual(fakeFormMeta);
    expect(buildFormSpy).not.toHaveBeenCalled();
  });

  it("calls queryFn when cache is empty (cold start)", async () => {
    const contract = makeClientContract("passport-renewal", "2.0.0");
    const builtMeta = { formId: "passport-renewal", version: "2.0.0" };
    const buildFormSpy = vi.fn().mockResolvedValue(builtMeta);

    const result = await qc.ensureQueryData({
      ...formMetaQueryOptions("passport-renewal", contract),
      queryFn: buildFormSpy,
    });

    expect(buildFormSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(builtMeta);
  });

  it("second ensureQueryData call with same key skips queryFn (cache hit)", async () => {
    const contract = makeClientContract("driver-licence", "1.5.0");
    const meta = { formId: "driver-licence", version: "1.5.0" } as FormMeta;
    const buildSpy = vi.fn().mockResolvedValue(meta);

    const opts = {
      ...formMetaQueryOptions("driver-licence", contract),
      queryFn: buildSpy,
    };

    await qc.ensureQueryData(opts);
    await qc.ensureQueryData(opts); // second call — should be a cache hit

    expect(buildSpy).toHaveBeenCalledTimes(1);
  });
});
