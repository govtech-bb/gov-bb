import { parseSesEvent } from "./ses-event.types";
import { NotificationDeliveryStatus } from "@/database/entities/notification-log.entity";

function event(eventType: string, messageId = "0100-abc"): string {
  return JSON.stringify({ eventType, mail: { messageId } });
}

describe("parseSesEvent", () => {
  it.each([
    ["Delivery", NotificationDeliveryStatus.DELIVERED],
    ["Bounce", NotificationDeliveryStatus.BOUNCED],
    ["Complaint", NotificationDeliveryStatus.COMPLAINED],
    ["Reject", NotificationDeliveryStatus.REJECTED],
  ])("maps eventType=%s to %s", (eventType, expected) => {
    expect(parseSesEvent(event(eventType))).toEqual({
      messageId: "0100-abc",
      status: expected,
    });
  });

  it("is case-insensitive on the event type", () => {
    expect(parseSesEvent(event("BOUNCE"))?.status).toBe(
      NotificationDeliveryStatus.BOUNCED,
    );
  });

  it("accepts the legacy notificationType field", () => {
    const body = JSON.stringify({
      notificationType: "Bounce",
      mail: { messageId: "m-1" },
    });
    expect(parseSesEvent(body)).toEqual({
      messageId: "m-1",
      status: NotificationDeliveryStatus.BOUNCED,
    });
  });

  it("unwraps an SNS Notification envelope (non-raw delivery)", () => {
    const inner = JSON.stringify({
      eventType: "Delivery",
      mail: { messageId: "wrapped-1" },
    });
    const envelope = JSON.stringify({ Type: "Notification", Message: inner });
    expect(parseSesEvent(envelope)).toEqual({
      messageId: "wrapped-1",
      status: NotificationDeliveryStatus.DELIVERED,
    });
  });

  it.each(["Send", "Open", "Click", "DeliveryDelay", "Rendering Failure"])(
    "returns null for untracked event type %s",
    (eventType) => {
      expect(parseSesEvent(event(eventType))).toBeNull();
    },
  );

  it("returns null on malformed JSON", () => {
    expect(parseSesEvent("not json")).toBeNull();
  });

  it("returns null when the message id is missing", () => {
    expect(parseSesEvent(JSON.stringify({ eventType: "Delivery" }))).toBeNull();
    expect(
      parseSesEvent(JSON.stringify({ eventType: "Delivery", mail: {} })),
    ).toBeNull();
  });

  it("returns null when the event type is missing", () => {
    expect(
      parseSesEvent(JSON.stringify({ mail: { messageId: "m" } })),
    ).toBeNull();
  });
});
