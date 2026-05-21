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
  it("returns a tuple of [FORM_SCHEMA_CACHE_KEY, formId, version]", () => {
    const key = formSchemaCacheKey("my-form", "2.1.0");
    expect(key).toEqual([FORM_SCHEMA_CACHE_KEY, "my-form", "2.1.0"]);
  });

  it("two calls with the same args produce deeply-equal keys", () => {
    const a = formSchemaCacheKey("passport", "1.0.0");
    const b = formSchemaCacheKey("passport", "1.0.0");
    expect(a).toEqual(b);
  });

  it("different versions produce different keys", () => {
    const a = formSchemaCacheKey("passport", "1.0.0");
    const b = formSchemaCacheKey("passport", "1.1.0");
    expect(a).not.toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// contractQueryOptions
// ---------------------------------------------------------------------------

describe("contractQueryOptions", () => {
  it("queryKey starts with CONTRACT_CACHE_KEY and includes formId", () => {
    const opts = contractQueryOptions("benefit-claim");
    expect(opts.queryKey).toEqual([CONTRACT_CACHE_KEY, "benefit-claim"]);
  });

  it("staleTime is 60 seconds", () => {
    const opts = contractQueryOptions("benefit-claim");
    expect(opts.staleTime).toBe(60_000);
  });

  it("queryFn is defined", () => {
    const opts = contractQueryOptions("benefit-claim");
    expect(typeof opts.queryFn).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// formMetaQueryOptions
// ---------------------------------------------------------------------------

describe("formMetaQueryOptions", () => {
  it("queryKey includes FORM_SCHEMA_CACHE_KEY, formId, and contract version", () => {
    const contract = makeClientContract("benefit-claim", "3.0.0");
    const opts = formMetaQueryOptions("benefit-claim", contract);
    expect(opts.queryKey).toEqual([
      FORM_SCHEMA_CACHE_KEY,
      "benefit-claim",
      "3.0.0",
    ]);
  });

  it("staleTime is Infinity", () => {
    const contract = makeClientContract("benefit-claim", "3.0.0");
    const opts = formMetaQueryOptions("benefit-claim", contract);
    expect(opts.staleTime).toBe(Infinity);
  });

  it("different versions on the same formId produce different queryKeys", () => {
    const v1 = makeClientContract("benefit-claim", "1.0.0");
    const v2 = makeClientContract("benefit-claim", "2.0.0");
    const optsV1 = formMetaQueryOptions("benefit-claim", v1);
    const optsV2 = formMetaQueryOptions("benefit-claim", v2);
    expect(optsV1.queryKey).not.toEqual(optsV2.queryKey);
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

  it("stores and retrieves FormMeta by (formId, version) key", async () => {
    const contract = makeClientContract("passport-renewal", "1.0.0");

    const fakeFormMeta = { formId: "passport-renewal", version: "1.0.0" };

    // Seed the cache directly (simulates a completed loader run)
    qc.setQueryData(
      formSchemaCacheKey("passport-renewal", "1.0.0"),
      fakeFormMeta,
    );

    // Reading with ensureQueryData should return the cached value without
    // calling the queryFn.
    const buildFormSpy = jest.fn().mockResolvedValue(fakeFormMeta);
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
    const buildFormSpy = jest.fn().mockResolvedValue(builtMeta);

    const result = await qc.ensureQueryData({
      ...formMetaQueryOptions("passport-renewal", contract),
      queryFn: buildFormSpy,
    });

    expect(buildFormSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(builtMeta);
  });

  it("does NOT return v1 cache when version bumps to v2", async () => {
    const v1Meta = { formId: "birth-cert", version: "1.0.0" } as FormMeta;

    // Seed v1 in the cache
    qc.setQueryData(formSchemaCacheKey("birth-cert", "1.0.0"), v1Meta);

    const v2Contract = makeClientContract("birth-cert", "2.0.0");
    const v2Meta = { formId: "birth-cert", version: "2.0.0" } as FormMeta;
    const buildSpy = jest.fn().mockResolvedValue(v2Meta);

    const result = await qc.ensureQueryData({
      ...formMetaQueryOptions("birth-cert", v2Contract),
      queryFn: buildSpy,
    });

    // v2 cache key is different — buildForm must have run
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(result.version).toBe("2.0.0");

    // v1 entry remains untouched in the cache
    const cachedV1 = qc.getQueryData<FormMeta>(
      formSchemaCacheKey("birth-cert", "1.0.0"),
    );
    expect(cachedV1?.version).toBe("1.0.0");
  });

  it("second ensureQueryData call with same key skips queryFn (cache hit)", async () => {
    const contract = makeClientContract("driver-licence", "1.5.0");
    const meta = { formId: "driver-licence", version: "1.5.0" } as FormMeta;
    const buildSpy = jest.fn().mockResolvedValue(meta);

    const opts = {
      ...formMetaQueryOptions("driver-licence", contract),
      queryFn: buildSpy,
    };

    await qc.ensureQueryData(opts);
    await qc.ensureQueryData(opts); // second call — should be a cache hit

    expect(buildSpy).toHaveBeenCalledTimes(1);
  });
});
