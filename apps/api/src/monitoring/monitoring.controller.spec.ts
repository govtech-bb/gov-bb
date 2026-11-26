import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AdminTokenGuard } from "@/common/guards/admin-token.guard";
import { MonitoringController } from "./monitoring.controller";

const mockRepo = {
  findRecent: vi.fn(),
};

const mockWebhookDestinations = {
  getAudit: vi.fn(),
};

const mockMission6 = {
  report: vi.fn(),
};

describe("MonitoringController", () => {
  let controller: MonitoringController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new MonitoringController(
      mockRepo as never,
      mockWebhookDestinations as never,
      mockMission6 as never,
    );
  });

  describe("webhookDestinationsAudit (GET /monitoring/webhook-destinations)", () => {
    it("returns the per-MDA destinations audit", () => {
      const audit = {
        issues: [],
        missingMinistries: ["health"],
        configuredMinistries: ["youth", "education"],
        ok: false,
      };
      mockWebhookDestinations.getAudit.mockReturnValue(audit);

      const result = controller.webhookDestinationsAudit();

      expect(result).toMatchObject({ status: "success" });
      expect(result.data).toEqual(audit);
    });
  });

  describe("mission6Report (GET /monitoring/mission6)", () => {
    it("returns the Mission 6 figures", async () => {
      const report = {
        generatedAt: "2026-11-26T19:00:00.000Z",
        services: { "form-a": "Apply for A" },
        applications: [],
        payments: [],
      };
      mockMission6.report.mockResolvedValue(report);

      const result = await controller.mission6Report();

      expect(result).toMatchObject({ status: "success" });
      expect(result.data).toEqual(report);
    });

    it("is behind the MONITORING_API_TOKEN guard", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        MonitoringController.prototype.mission6Report,
      );
      expect(guards).toHaveLength(1);
      expect(guards[0]).toBeInstanceOf(AdminTokenGuard);
      expect(guards[0]).toMatchObject({
        envVarNames: ["MONITORING_API_TOKEN"],
      });
    });
  });

  describe("recentNotifications (GET /monitoring/notification-log)", () => {
    it("maps rows to the read-only projection and serializes createdAt to ISO", async () => {
      const created = new Date("2026-07-07T22:14:41.400Z");
      mockRepo.findRecent.mockResolvedValue([
        {
          referenceCode: "STSF-2607-9DWQKWA",
          formId: "simple-three-step-form",
          recipientKind: "submitted",
          recipient: "jane.doe@example.com",
          outcome: "sent",
          providerMessageId: "ses-514569276",
          createdAt: created,
          // fields intentionally NOT surfaced by the projection:
          submissionId: "should-not-appear",
          error: "should-not-appear",
        },
      ]);

      const result = await controller.recentNotifications();

      expect(mockRepo.findRecent).toHaveBeenCalledWith(200);
      expect(result).toMatchObject({ status: "success" });
      expect(result.data).toEqual([
        {
          referenceCode: "STSF-2607-9DWQKWA",
          formId: "simple-three-step-form",
          recipientKind: "submitted",
          recipient: "jane.doe@example.com",
          outcome: "sent",
          providerMessageId: "ses-514569276",
          createdAt: "2026-07-07T22:14:41.400Z",
        },
      ]);
    });

    it("parses the limit query param and passes it through", async () => {
      mockRepo.findRecent.mockResolvedValue([]);

      await controller.recentNotifications("50");

      expect(mockRepo.findRecent).toHaveBeenCalledWith(50);
    });

    it("tolerates a non-Date createdAt (stringifies it) and a null recipient", async () => {
      mockRepo.findRecent.mockResolvedValue([
        {
          referenceCode: null,
          formId: "summer-camp",
          recipientKind: "config",
          recipient: null,
          outcome: "no_recipient",
          providerMessageId: null,
          createdAt: "2026-07-07T21:40:12.220Z",
        },
      ]);

      const result = await controller.recentNotifications();

      expect(result.data?.[0]).toMatchObject({
        referenceCode: null,
        recipient: null,
        outcome: "no_recipient",
        createdAt: "2026-07-07T21:40:12.220Z",
      });
    });
  });
});
