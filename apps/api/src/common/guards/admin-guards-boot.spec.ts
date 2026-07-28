import { Test } from "@nestjs/testing";
import { DraftArchiveController } from "@/forms/form-definitions/draft-archive.controller";
import { DraftArchiveService } from "@/forms/form-definitions/draft-archive.service";
import { FormDisabledOverridesAdminController } from "@/forms/form-disabled-overrides/form-disabled-overrides.admin.controller";
import { FormDisabledOverridesService } from "@/forms/form-disabled-overrides/form-disabled-overrides.service";
import { ServiceStatusController } from "@/services/service-status.controller";
import { ServiceStatusService } from "@/services/service-status.service";

/**
 * Boot-safety pin for the admin guards (ADR 0061): compiles the REAL admin
 * controllers into a Nest testing module and inits the app, exercising Nest's
 * enhancer resolution for them — something no unit spec does (they construct
 * controllers directly, bypassing the DI container entirely).
 *
 * Why it exists: `AdminTokenGuard` has a variadic constructor, so a
 * class-reference `@UseGuards(AdminTokenGuard)` (instead of an instance) makes
 * DI try to resolve the emitted constructor paramtype and throw
 * `UnknownDependenciesException`. Without this spec that surfaces at ECS boot
 * (crash-loop → circuit-breaker rollback), not in CI.
 */
describe("admin controllers boot with their guards", () => {
  it("compiles and inits a module hosting both admin controllers", async () => {
    const mod = await Test.createTestingModule({
      controllers: [
        DraftArchiveController,
        FormDisabledOverridesAdminController,
        ServiceStatusController,
      ],
      providers: [
        { provide: DraftArchiveService, useValue: {} },
        { provide: FormDisabledOverridesService, useValue: {} },
        { provide: ServiceStatusService, useValue: {} },
      ],
    }).compile();

    const app = mod.createNestApplication();
    await app.init();
    await app.close();
  });
});
