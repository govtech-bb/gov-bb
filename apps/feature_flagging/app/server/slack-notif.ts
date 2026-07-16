import { getSlackWebhookUrl } from "./secrets";

export async function sendSlackNotification(message: string): Promise<void> {
  try {
    const webhookUrl = await getSlackWebhookUrl();
    if (!webhookUrl) return;
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
      }),
      // Bound the request: the caller awaits this, so a slow/unreachable Slack
      // endpoint must not stall the admin-facing status-change response.
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Best-effort: a secret-fetch error, request timeout, or Slack delivery
    // failure must never break an already-successful status change.
  }
}
