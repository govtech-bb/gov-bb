import { BadRequestException } from "@nestjs/common";
import { JourneyService, sanitizeProps } from "./journey.service";
import { MAX_EVENTS_PER_REQUEST, MAX_PROPS } from "./journey-event.schema";

const ID = "6f1c2a4e-8b3d-4c5e-9f60-1a2b3c4d5e6f";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0";

function event(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    app: "forms",
    event: "apply-for-food-business-licence:form-step-view",
    props: { form: "apply-for-food-business-licence", step: "two" },
    path: "/forms/apply-for-food-business-licence",
    ...over,
  };
}

function logged(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));
}

describe("JourneyService", () => {
  let service: JourneyService;
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new JourneyService();
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => stdout.mockRestore());

  it("writes one journey_event JSON line per event", () => {
    expect(service.record(event(), BROWSER)).toBe(1);
    const [line] = logged(stdout);
    expect(line).toMatchObject({
      log_type: "journey_event",
      app: "forms",
      event: "apply-for-food-business-licence:form-step-view",
      event_id: ID,
      path: "/forms/apply-for-food-business-licence",
      props: { form: "apply-for-food-business-licence", step: "two" },
    });
    expect(line).not.toHaveProperty("status");
    expect(line).not.toHaveProperty("service");
  });

  it("accepts the text/plain JSON string that sendBeacon sends", () => {
    expect(service.record(JSON.stringify(event()), BROWSER)).toBe(1);
  });

  it("accepts a batch", () => {
    expect(service.record([event(), event()], BROWSER)).toBe(2);
    expect(stdout).toHaveBeenCalledTimes(2);
  });

  it("accepts runtime-built names: hashed long ids, service slugs, steps", () => {
    for (const name of [
      "apply-for-a-very-long-form-identifier-th~1a2b3c:fconf",
      "service-births-register-a-birth",
      "apply-for-food-business-licence:form-step-three",
      "search-no-results",
    ]) {
      expect(service.record(event({ event: name }), BROWSER)).toBe(1);
    }
  });

  // A malformed envelope is a broken client: 400, so it shows up as errors.
  it.each([
    ["not JSON", "{oops"],
    ["a JSON number", "42"],
    ["a JSON string", '"hello"'],
    ["null", null],
    ["an empty batch", []],
    [
      "a batch over the limit",
      Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => event()),
    ],
  ])("rejects %s with 400 and logs nothing", (_label, body) => {
    expect(() => service.record(body, BROWSER)).toThrow(BadRequestException);
    expect(stdout).not.toHaveBeenCalled();
  });

  // One bad event must not lose the good ones in its batch (#3022 review):
  // sendBeacon never reads the response, so a 400 would be silent data loss.
  it("logs the valid events in a batch and drops only the invalid one", () => {
    const body = [
      event(),
      event({ path: "/forms/x?token=abc" }),
      event({ event: "test-form:form-review" }),
    ];
    expect(service.record(body, BROWSER)).toBe(2);
    const lines = logged(stdout);
    expect(lines.filter((l) => l.log_type === "journey_event")).toHaveLength(2);
    expect(lines.filter((l) => l.log_type === "journey_rejected")).toEqual([
      expect.objectContaining({ dropped: 1, received: 3, fields: ["path"] }),
    ]);
  });

  it.each([
    ["unknown app", event({ app: "cams" })],
    ["upper-case or spaced name", event({ event: "Form Start" })],
    ["name too long", event({ event: "a".repeat(101) })],
    ["path with a query string", event({ path: "/forms/x?token=abc" })],
    ["non-uuid id", event({ id: "123" })],
    ["unknown top-level field", event({ email: "a@b.com" })],
    ["nested prop", event({ props: { form: { id: "x" } } })],
    [
      "too many props",
      event({
        props: Object.fromEntries(
          Array.from({ length: MAX_PROPS + 1 }, (_, i) => [`k${i}`, i]),
        ),
      }),
    ],
  ])(
    "drops an event with %s, counting it without logging its content",
    (_label, body) => {
      expect(service.record(body, BROWSER)).toBe(0);
      const lines = logged(stdout);
      expect(lines).toEqual([
        expect.objectContaining({
          log_type: "journey_rejected",
          dropped: 1,
          received: 1,
        }),
      ]);
      expect(String(stdout.mock.calls[0][0])).not.toContain("a@b.com");
      expect(String(stdout.mock.calls[0][0])).not.toContain("token=abc");
    },
  );

  it("drops crawler traffic without logging it", () => {
    expect(
      service.record(event(), "Mozilla/5.0 (compatible; Googlebot/2.1)"),
    ).toBe(0);
    expect(service.record(event(), "HeadlessChrome/120.0")).toBe(0);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("never logs the user agent or an IP", () => {
    service.record(event(), BROWSER);
    const raw = String(stdout.mock.calls[0][0]);
    expect(raw).not.toContain("Chrome");
  });
});

describe("sanitizeProps", () => {
  it.each([
    ["an unmasked national ID", "passport 850101-0001"],
    ["a phone number with separators", "call 246 123 4567"],
    ["a NIS number", "nis 123456"],
    ["an email", "mailto:someone@example.com"],
  ])("blanks a string carrying %s", (_label, value) => {
    expect(sanitizeProps({ query: value, position: 2 })).toEqual({
      query: "[redacted]",
      position: 2,
    });
  });

  it("keeps an already-masked query from the sites", () => {
    expect(sanitizeProps({ query: "nis 1****6" })).toEqual({
      query: "nis 1****6",
    });
  });

  it("keeps short numbers such as years", () => {
    expect(sanitizeProps({ query: "cape exam 2024 under 11" })).toEqual({
      query: "cape exam 2024 under 11",
    });
  });

  it("leaves non-string values untouched", () => {
    const props = { form: "x", hasPayment: true, duration_seconds: 42 };
    expect(sanitizeProps(props)).toEqual(props);
  });
});
