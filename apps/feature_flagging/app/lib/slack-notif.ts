const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export function sendSlackNotification(message: string) {
  if (!SLACK_WEBHOOK_URL) return;
  fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: message,
    }),
  });
}
