import { expect, type Page, test } from "@playwright/test";

// End-to-end proof of the inline forms flow, model mocked (LLM_MOCK). Drives the
// REAL UI through the chat-feedback service: present → answer (pills, checkbox)
// → set → summary → approval → dry-run submit. Asserts the widgets render, the
// validation/coercion loop accepts each answer, the approval card shows what
// will be sent, and the submit dry-runs. Closes the "never clicked the forms UI"
// gap — only the model's tool-call decisions are scripted; everything the user
// touches is the production app.

const composer = "Ask the government assistant";

// Type + send a message. Retries the fill until it sticks: on first paint the
// SSR markup isn't hydrated yet, so the controlled composer would reset an early
// value and leave Send disabled. toPass loops until React has attached.
async function send(page: Page, text: string): Promise<void> {
  const box = page.getByRole("textbox", { name: composer });
  const sendBtn = page.getByRole("button", { name: "Send" });
  await expect(async () => {
    await box.fill(text);
    await expect(sendBtn).toBeEnabled({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await sendBtn.click();
}

// Warm the chat route in an isolated context before the assertions. The first
// chat request after a cold server boot is slow enough that the client fires a
// duplicate continuation mid-stream — a real cold-start race (tracked in
// BUILD.md), not a test artifact. One throwaway turn JIT-warms the route so the
// flow below runs deterministically; doing it in a separate context keeps the
// race out of the asserted run.
test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await send(page, "hello");
    await page
      .getByRole("button", { name: "Start again" })
      .waitFor({ timeout: 30_000 });
  } finally {
    await context.close();
  }
});

test("feedback form: collect → review → approve → dry-run submit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: composer })).toBeVisible();

  // 1. Ask to leave feedback → the assistant presents the first field.
  await send(page, "I want to leave feedback");

  // experience-rating (select) renders as option pills.
  await expect(
    page.getByText("How was your experience with the assistant?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Very good", exact: true }).click();

  // 2. declaration-confirmed (checkbox) renders as a checkbox + Continue.
  await expect(page.getByRole("checkbox", { name: "I confirm" })).toBeVisible();
  await page.getByRole("checkbox", { name: "I confirm" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. The assistant summarises and asks to confirm.
  await expect(page.getByText(/Shall I submit this/i)).toBeVisible();
  await send(page, "yes");

  // 4. The approval card shows the answers that will be sent. The humanised
  //    field label ("Experience rating") is unique to the card.
  await expect(page.getByText("Check your answers")).toBeVisible();
  await expect(
    page.getByText("Experience rating", { exact: true }),
  ).toBeVisible();

  // 5. Approve → the server validates + dry-run submits (SUBMIT_LIVE unset).
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByText(/not actually submitted|test run/i),
  ).toBeVisible();
});
