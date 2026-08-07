import sqsConfig, {
  DEFAULT_MAX_RECEIVE_COUNT,
  parseMaxReceiveCount,
} from "./sqs.config";

describe("parseMaxReceiveCount", () => {
  it("parses a valid integer string", () => {
    expect(parseMaxReceiveCount("5")).toBe(5);
  });

  it("falls back to the default for unset / blank / non-numeric input", () => {
    expect(parseMaxReceiveCount(undefined)).toBe(DEFAULT_MAX_RECEIVE_COUNT);
    expect(parseMaxReceiveCount("")).toBe(DEFAULT_MAX_RECEIVE_COUNT);
    expect(parseMaxReceiveCount("abc")).toBe(DEFAULT_MAX_RECEIVE_COUNT);
  });

  it("falls back to the default for values below 1 (matches the boot-gate bound)", () => {
    expect(parseMaxReceiveCount("0")).toBe(DEFAULT_MAX_RECEIVE_COUNT);
    expect(parseMaxReceiveCount("-3")).toBe(DEFAULT_MAX_RECEIVE_COUNT);
  });
});

describe("sqsConfig — maxReceiveCount", () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL };
    delete process.env.SQS_MAX_RECEIVE_COUNT;
  });

  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("defaults to the shared default when unset", () => {
    expect(sqsConfig().maxReceiveCount).toBe(DEFAULT_MAX_RECEIVE_COUNT);
  });

  it("reads and parses an override rather than the raw string", () => {
    process.env.SQS_MAX_RECEIVE_COUNT = "5";
    expect(sqsConfig().maxReceiveCount).toBe(5);
  });

  it("never yields NaN/0 on invalid input (no silent drift)", () => {
    process.env.SQS_MAX_RECEIVE_COUNT = "";
    expect(sqsConfig().maxReceiveCount).toBe(DEFAULT_MAX_RECEIVE_COUNT);
  });
});
