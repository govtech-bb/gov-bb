import { Test } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import type { Processor } from "@govtech-bb/form-types";
import { ProcessorFactory } from "./processor-factory.service";
import {
  ISubmissionProcessor,
  SUBMISSION_PROCESSORS,
} from "./submission-processor.interface";

const makeProcessor = (type: Processor["type"]): ISubmissionProcessor => ({
  type,
  process: jest.fn().mockResolvedValue(undefined),
});

const cfg = (type: string): Processor =>
  ({ type, config: {} }) as unknown as Processor;

describe("ProcessorFactory", () => {
  describe("resolve", () => {
    let factory: ProcessorFactory;
    const emailProcessor = makeProcessor("email");
    const opencrvsProcessor = makeProcessor("opencrvs");

    beforeEach(async () => {
      const module = await Test.createTestingModule({
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
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();

      const resolved = factory.resolve([cfg("email"), cfg("unknown")]);

      expect(resolved).toEqual([emailProcessor]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('No processor registered for type "unknown"'),
      );

      warn.mockRestore();
    });
  });

  describe("resolve with partial registry", () => {
    let factory: ProcessorFactory;
    const emailProcessor = makeProcessor("email");

    beforeEach(async () => {
      const module = await Test.createTestingModule({
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
      jest.spyOn(Logger.prototype, "warn").mockImplementation();

      const resolved = factory.resolve([cfg("opencrvs")]);

      expect(resolved).toEqual([]);
    });
  });
});
