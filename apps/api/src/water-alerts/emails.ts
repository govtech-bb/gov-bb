/**
 * Water-alert email content. Pure builders — they return { subject, html, text }
 * and do no sending, so they're easy to unit-test. Delivery goes through the
 * shared SesMailer.
 *
 * The branded shell mirrors the platform's transactional template: yellow
 * header, white body, blue footer. Ported from the prototype's src/lib/email.ts
 * (Nodemailer HTML), unchanged in look.
 */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Government of Barbados branded email shell. */
export function renderEmail(content: string): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.55; color: #1a202c; margin: 0; padding: 0; background-color: #f4f5f7; }
      .wrapper { max-width: 640px; margin: 0 auto; background: #ffffff; }
      .header { background-color: #ffc726; padding: 20px 40px; }
      .header span { font-size: 18px; font-weight: 700; color: #1a202c; }
      .body { padding: 8px 40px 32px; }
      .title { font-size: 30px; font-weight: 800; color: #1a202c; margin: 28px 0 20px; line-height: 1.15; }
      .intro { font-size: 15px; color: #1a202c; margin: 0 0 24px; }
      .btn { background-color: #00267f; color: #ffffff !important; padding: 12px 22px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 700; }
      .muted { color: #555555; font-size: 13px; }
      .footer { background-color: #00267f; color: #ffffff; padding: 28px 40px; }
      .footer p { font-size: 14px; color: #ffffff; margin: 0 0 14px; }
      .footer .copyright { opacity: 0.9; margin: 0; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header"><span>Government of Barbados</span></div>
      <div class="body">${content}</div>
      <div class="footer">
        <p>This is an automated email from the Government of Barbados.</p>
        <p>Please do not reply to this email.</p>
        <p class="copyright">&copy; ${year} Government of Barbados</p>
      </div>
    </div>
  </body>
</html>`;
}

/** Double-opt-in confirmation email. */
export function buildConfirmEmail(
  areaLabel: string,
  confirmUrl: string,
): EmailContent {
  const html = renderEmail(`
    <h1 class="title">Confirm your water alerts</h1>
    <p class="intro">You asked to get an email when water is affected in <strong>${areaLabel}</strong>. Confirm below and we'll let you know whenever there's a notice for your area.</p>
    <p style="margin: 24px 0;"><a class="btn" href="${confirmUrl}">Confirm my alerts</a></p>
    <p class="muted">If you didn't ask for this, you can ignore this email — nothing will happen.</p>
  `);
  const text = [
    "Confirm your water alerts",
    "",
    `You asked to get an email when water is affected in ${areaLabel}.`,
    "Confirm by opening this link:",
    confirmUrl,
    "",
    "If you didn't ask for this, you can ignore this email.",
  ].join("\n");
  return { subject: "Confirm your water alerts", html, text };
}
