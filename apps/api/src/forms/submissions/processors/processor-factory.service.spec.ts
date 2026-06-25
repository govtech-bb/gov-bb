import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import type { Processor } from "@govtech-bb/form-types";
import { ProcessorFactory } from "./processor-factory.service";
import {
  ISubmissionProcessor,
  SUBMISSION_PROCESSORS,
} from "./submission-processor.interface";

const makeProcessor = (type: Processor["type"]): ISubmissionProcessor => ({
  type,
  process: vi.fn().mockResolvedValue(undefined),
});

const cfg = (type: string): Processor =>
  ({ type, config: {} }) as unknown as Processor;

describe("ProcessorFactory", () => {
  let module: TestingModule;

  afterEach(async () => {
    if (module) await module.close();
  });

  describe("resolve", () => {
    let factory: ProcessorFactory;
    const emailProcessor = makeProcessor("email");
    const opencrvsProcessor = makeProcessor("opencrvs");

    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [
          ProcessorFactory,
          {
            provide: SUBMISSION_PROCESSORS,
            useValue: [emailProcessor, opencrvsProcessor],
          },
        ],
      }).compile();

      factory = module.get(ProcessorFactory);
    });

    it("returns all matching handlers when multiple integrations are configured", () => {
      const resolved = factory.resolve([cfg("email"), cfg("opencrvs")]);

      expect(resolved).toHaveLength(2);
      expect(resolved).toContain(emailProcessor);
      expect(resolved).toContain(opencrvsProcessor);
    });

    it("returns a single handler when one integration is configured", () => {
      const resolved = factory.resolve([cfg("email")]);

      expect(resolved).toEqual([emailProcessor]);
    });

    it("returns empty array when no integrations are configured", () => {
      const resolved = factory.resolve([]);

      expect(resolved).toEqual([]);
    });

    it("skips and warns on an unknown processor type", () => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});

      const resolved = factory.resolve([cfg("email"), cfg("unknown")]);

      expect(resolved).toEqual([emailProcessor]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('No processor registered for type "unknown"'),
      );

      warn.mockRestore();
    });

    it("returns a single handler per type when multiple same-type configs are present", () => {
      // Internal iteration means each handler reads every matching entry
      // itself — the factory must not enqueue duplicate dispatches.
      const resolved = factory.resolve([
        cfg("email"),
        cfg("email"),
        cfg("opencrvs"),
      ]);

      expect(resolved).toHaveLength(2);
      expect(resolved).toEqual([emailProcessor, opencrvsProcessor]);
    });
  });

  describe("resolve with partial registry", () => {
    let factory: ProcessorFactory;
    const emailProcessor = makeProcessor("email");

    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [
          ProcessorFactory,
          {
            provide: SUBMISSION_PROCESSORS,
            useValue: [emailProcessor],
          },
        ],
      }).compile();

      factory = module.get(ProcessorFactory);
    });

    it("returns empty array when configured types are not in the registry", () => {
      vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

      const resolved = factory.resolve([cfg("opencrvs")]);

      expect(resolved).toEqual([]);
    });
  });

  describe("resolveByType", () => {
    let factory: ProcessorFactory;
    const emailProcessor = makeProcessor("email");

    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [
          ProcessorFactory,
          { provide: SUBMISSION_PROCESSORS, useValue: [emailProcessor] },
        ],
      }).compile();
      factory = module.get(ProcessorFactory);
    });

    it("returns the processor instance for a registered type", () => {
      expect(factory.resolveByType("email")).toBe(emailProcessor);
    });

    it("returns undefined for an unregistered type", () => {
      expect(factory.resolveByType("unknown")).toBeUndefined();
    });
  });

  describe("resolveSplit", () => {
    let factory: ProcessorFactory;
    const emailProcessor = makeProcessor("email");
    const gatingPayment: ISubmissionProcessor = {
      type: "payment" as Processor["type"],
      gatesPipeline: true,
      process: vi.fn().mockResolvedValue({ kind: "completed" }),
    };

    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [
          ProcessorFactory,
          {
            provide: SUBMISSION_PROCESSORS,
            useValue: [emailProcessor, gatingPayment],
          },
        ],
      }).compile();

      factory = module.get(ProcessorFactory);
    });

    it("splits gating from non-gating processors", () => {
      const split = factory.resolveSplit([cfg("payment"), cfg("email")]);

      expect(split.gating).toEqual([gatingPayment]);
      expect(split.nonGating).toEqual([emailProcessor]);
    });

    it("returns empty arrays for empty config", () => {
      expect(factory.resolveSplit([])).toEqual({ gating: [], nonGating: [] });
    });
  });
});
