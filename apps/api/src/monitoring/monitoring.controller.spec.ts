import { MonitoringController } from "./monitoring.controller";

const mockRepo = {
  findRecent: vi.fn(),
};

const mockWebhookDestinations = {
  getAudit: vi.fn(),
};

describe("MonitoringController", () => {
  let controller: MonitoringController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new MonitoringController(
      mockRepo as never,
      mockWebhookDestinations as never,
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
