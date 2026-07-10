import {
  DEFAULT_SEARCH,
  parseSearch,
  stripDefaults,
  type ServicesSearch,
} from "./search-params";

describe("parseSearch", () => {
  it("fills every field with its default for a bare `/` URL", () => {
    expect(parseSearch({})).toEqual(DEFAULT_SEARCH);
  });

  it("reads through valid filter and sort params", () => {
    expect(
      parseSearch({
        q: "birth",
        category: "family",
        type: "Form only",
        status: "disabled",
        sortKey: "category",
        sortDir: "desc",
      }),
    ).toEqual({
      q: "birth",
      category: "family",
      type: "Form only",
      status: "disabled",
      sortKey: "category",
      sortDir: "desc",
    });
  });

  it("falls back to the default for an unknown status/sort value", () => {
    expect(
      parseSearch({ status: "bogus", sortKey: "nope", sortDir: "sideways" }),
    ).toMatchObject({
      status: "all",
      sortKey: "status",
      sortDir: "asc",
    });
  });

  it("keeps a partial URL and defaults only the missing fields", () => {
    expect(parseSearch({ status: "enabled" })).toEqual({
      ...DEFAULT_SEARCH,
      status: "enabled",
    });
  });
});

describe("stripDefaults", () => {
  it("drops every default-valued field so a base view serialises to nothing", () => {
    expect(stripDefaults(DEFAULT_SEARCH)).toEqual({
      q: undefined,
      category: undefined,
      type: undefined,
      status: undefined,
      sortKey: undefined,
      sortDir: undefined,
    });
  });

  it("keeps only the fields that differ from the default", () => {
    const next: ServicesSearch = {
      ...DEFAULT_SEARCH,
      q: "passport",
      status: "form_disabled",
    };
    expect(stripDefaults(next)).toEqual({
      q: "passport",
      category: undefined,
      type: undefined,
      status: "form_disabled",
      sortKey: undefined,
      sortDir: undefined,
    });
  });

  it("keeps a non-default sortKey while dropping the still-default sortDir", () => {
    const next: ServicesSearch = { ...DEFAULT_SEARCH, sortKey: "service" };
    const stripped = stripDefaults(next);
    expect(stripped.sortKey).toBe("service");
    expect(stripped.sortDir).toBeUndefined();
  });

  it("round-trips through parseSearch back to the original view", () => {
    const view: ServicesSearch = {
      q: "id card",
      category: "identity",
      type: "Content",
      status: "disabled",
      sortKey: "type",
      sortDir: "desc",
    };
    expect(parseSearch(stripDefaults(view))).toEqual(view);
  });
});
