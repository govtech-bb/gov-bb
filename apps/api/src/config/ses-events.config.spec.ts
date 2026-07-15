import sesEventsConfig from "./ses-events.config";

describe("sesEventsConfig", () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL };
    delete process.env.SES_EVENTS_QUEUE_URL;
    delete process.env.SES_EVENTS_REGION;
    delete process.env.SQS_REGION;
    delete process.env.SQS_ENDPOINT;
  });

  afterEach(() => {
    process.env = ORIGINAL;
  });

  it("defaults queueUrl to empty and region to ca-central-1", () => {
    const cfg = sesEventsConfig();
    expect(cfg.queueUrl).toBe("");
    expect(cfg.region).toBe("ca-central-1");
    expect(cfg.endpoint).toBeUndefined();
  });

  it("reads the queue URL + endpoint and falls back region to SQS_REGION", () => {
    process.env.SES_EVENTS_QUEUE_URL = "https://sqs/events";
    process.env.SQS_REGION = "us-east-1";
    process.env.SQS_ENDPOINT = "http://localhost:4566";
    const cfg = sesEventsConfig();
    expect(cfg.queueUrl).toBe("https://sqs/events");
    expect(cfg.region).toBe("us-east-1");
    expect(cfg.endpoint).toBe("http://localhost:4566");
  });

  it("prefers SES_EVENTS_REGION over SQS_REGION", () => {
    process.env.SES_EVENTS_REGION = "eu-west-1";
    process.env.SQS_REGION = "us-east-1";
    expect(sesEventsConfig().region).toBe("eu-west-1");
  });
});
