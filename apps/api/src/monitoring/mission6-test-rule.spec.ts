import { isTestApplicant, parseNamedTestInboxes } from "./mission6-test-rule";

const none = new Set<string>();

describe("isTestApplicant", () => {
  it("keeps an ordinary member of the public", () => {
    expect(
      isTestApplicant(
        {
          "applicant-details.applicant-email": "a.person@gmail.com",
          "applicant-details.first-name": "Kesha",
          "applicant-details.last-name": "Greaves",
        },
        none,
      ),
    ).toBe(false);
  });

  it.each([
    "someone@govtech.bb",
    "someone@public.digital",
    "x@mailinator.com",
    "x@yopmail.com",
    "x@example.com",
  ])("leaves out a team or throwaway email: %s", (email) => {
    expect(isTestApplicant({ "contact.email": email }, none)).toBe(true);
  });

  it.each(["officer@gov.bb", "officer@barbados.gov.bb"])(
    "keeps public servants applying as citizens: %s",
    (email) => {
      expect(isTestApplicant({ "contact.email": email }, none)).toBe(false);
    },
  );

  it("leaves out test-style names", () => {
    expect(isTestApplicant({ "you.first-name": "Test" }, none)).toBe(true);
    expect(isTestApplicant({ "you.full-name": "Demo User" }, none)).toBe(true);
  });

  it("reads first and last name together (John + Doe)", () => {
    expect(
      isTestApplicant(
        { "you.first-name": "John", "you.last-name": "Doe" },
        none,
      ),
    ).toBe(true);
  });

  it("reads names in name order when keys arrive in jsonb order (last before first)", () => {
    // jsonb stores keys shorter-first, so this is the order Postgres returns.
    expect(
      isTestApplicant(
        { "you.last-name": "Doe", "you.first-name": "John" },
        none,
      ),
    ).toBe(true);
    expect(
      isTestApplicant({ "you.lastName": "Doe", "you.firstName": "Jane" }, none),
    ).toBe(true);
    expect(
      isTestApplicant(
        {
          "you.surname": "Doe",
          "you.middle-name": "Q",
          "you.given-name": "John",
        },
        none,
      ),
    ).toBe(false);
  });

  it("checks only the domain, not the part before the @", () => {
    expect(
      isTestApplicant({ "contact.email": "govtech.fan@gmail.com" }, none),
    ).toBe(false);
    expect(
      isTestApplicant(
        { "contact.email": "my.example.address@gmail.com" },
        none,
      ),
    ).toBe(false);
  });

  it("does not join names across different steps", () => {
    expect(
      isTestApplicant(
        { "parent.first-name": "John", "child.last-name": "Doe" },
        none,
      ),
    ).toBe(false);
  });

  it("ignores 'test' in non-name answers and inside longer words", () => {
    expect(
      isTestApplicant({ "business.business-name": "Test Kitchen Ltd" }, none),
    ).toBe(false);
    expect(isTestApplicant({ "you.last-name": "Testa" }, none)).toBe(false);
  });

  it("leaves out a named inbox from the secret, case-insensitively", () => {
    const named = parseNamedTestInboxes("Tester@Gmail.com, other@x.com");
    expect(
      isTestApplicant({ "contact.email": "tester@gmail.com" }, named),
    ).toBe(true);
  });

  it("keeps a submission with no identity answers", () => {
    expect(isTestApplicant(null, none)).toBe(false);
    expect(isTestApplicant({}, none)).toBe(false);
  });
});

describe("parseNamedTestInboxes", () => {
  it("splits on commas, spaces and newlines and lowercases", () => {
    expect([...parseNamedTestInboxes(" A@x.com,\nb@y.com ;c@z.com ")]).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("is empty when unset", () => {
    expect(parseNamedTestInboxes(undefined).size).toBe(0);
  });
});
