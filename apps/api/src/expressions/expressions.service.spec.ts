import { Test } from "@nestjs/testing";
import { ExpressionsModule } from "./expressions.module";
import { ExpressionsService } from "./expressions.service";

describe("ExpressionsService", () => {
  let service: ExpressionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ExpressionsModule],
    }).compile();
    service = module.get(ExpressionsService);
  });

  it("resolves a processor config with embedded rules", () => {
    const cfg = {
      to: { var: "values.email" },
      amount: {
        if: [{ ">=": [{ age: [{ var: "values.dob" }] }, 60] }, 0, 25],
      },
    };
    const out = service.resolveConfig(cfg, {
      values: { email: "x@y.z", dob: "1950-01-01" },
    });
    expect(out).toEqual({ to: "x@y.z", amount: 0 });
  });

  it("leaves a config without rules unchanged", () => {
    const cfg = { to: "static@example.com", subject: "Hi" };
    expect(service.resolveConfig(cfg, { values: {} })).toEqual(cfg);
  });
});
