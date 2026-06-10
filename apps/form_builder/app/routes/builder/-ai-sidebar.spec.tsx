/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// The convert server-fn family is createServerFn (ESM + RPC at module-eval); stub each.
const editRecipe = jest.fn();
const presignPdfUpload = jest.fn();
const startPdfConvert = jest.fn();
const getPdfConvertStatus = jest.fn();

jest.mock("../../server/ai-builder/convert", () => ({
  editRecipe: (...args: unknown[]) => editRecipe(...args),
  presignPdfUpload: (...args: unknown[]) => presignPdfUpload(...args),
  startPdfConvert: (...args: unknown[]) => startPdfConvert(...args),
  getPdfConvertStatus: (...args: unknown[]) => getPdfConvertStatus(...args),
  getAiStatus: jest.fn(),
}));

// Stub global fetch for the direct browser → S3 PUT. jsdom (the test env) ships
// neither fetch nor Response, so install a plain mock and a duck-typed fake
// response — the sidebar only reads `.ok` off the result.
const okResponse = { ok: true, status: 200 } as unknown as Response;
const fetchSpy = jest.fn(async () => okResponse);
(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

beforeEach(() => {
  editRecipe.mockReset();
  presignPdfUpload.mockReset();
  startPdfConvert.mockReset();
  getPdfConvertStatus.mockReset();
  fetchSpy.mockClear();
  fetchSpy.mockResolvedValue(okResponse);
});

import { AiSidebar } from "./-ai-sidebar";

const DRAFT: RecipeDraft = {
  formId: "contact",
  title: "Contact",
  steps: [{ stepId: "step-1", title: "Step 1", fields: [], behaviours: [] }],
};

function setup(onApplyRecipe = jest.fn().mockResolvedValue({ applied: true })) {
  render(
    <AiSidebar draft={DRAFT} version="1.0.0" onApplyRecipe={onApplyRecipe} />,
  );
  return { onApplyRecipe };
}

describe("AiSidebar — Edit Form", () => {
  it("sends the message plus the serialized draft and applies the returned recipe", async () => {
    const recipe = { formId: "contact", steps: [] };
    editRecipe.mockResolvedValue({ recipe, reply: "Done — email is now required." });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "make the email field required",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    await waitFor(() => expect(editRecipe).toHaveBeenCalledTimes(1));
    const arg = editRecipe.mock.calls[0][0];
    expect(arg.data.message).toBe("make the email field required");
    // The current draft rides along as serialized recipe JSON.
    expect(JSON.parse(arg.data.recipeJson).formId).toBe("contact");

    expect(onApplyRecipe).toHaveBeenCalledWith(recipe, []);
    // Both turns land in the transcript.
    expect(screen.getByText("make the email field required")).toBeInTheDocument();
    expect(
      await screen.findByText("Done — email is now required."),
    ).toBeInTheDocument();
  });

  it("forwards unresolvableRefs from the convert response to the apply pipeline", async () => {
    const recipe = { formId: "contact", steps: [] };
    const unresolvableRefs = [
      { ref: "components/generic/text", path: "steps[step-1].elements[0].ref" },
    ];
    editRecipe.mockResolvedValue({
      recipe,
      reply: "Built it.",
      unresolvableRefs,
    });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "build a contact form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    await waitFor(() =>
      expect(onApplyRecipe).toHaveBeenCalledWith(recipe, unresolvableRefs),
    );
  });

  it("does not apply when the model replies conversationally (no recipe)", async () => {
    editRecipe.mockResolvedValue({ recipe: null, reply: "I can't do that." });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "delete everything",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("I can't do that.")).toBeInTheDocument();
    expect(onApplyRecipe).not.toHaveBeenCalled();
  });

  it("maps a raw 'Invariant failed' edit failure to a clear, true message", async () => {
    // The synchronous Edit Form path can still 504 at the CloudFront/Amplify
    // gateway for large recipes; TanStack Start's server-fn client then throws
    // Error("Invariant failed") because it got a CloudFront error page instead
    // of its JSON envelope. The user must never see that raw string.
    editRecipe.mockRejectedValue(new Error("Invariant failed"));
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "rebuild the entire 40-field form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/timed out or failed/i);
    expect(alert).toHaveTextContent(/too large|simplify/i);
    expect(alert).not.toHaveTextContent(/invariant/i);
  });

  it("maps a timeout error from the edit call to a clear message", async () => {
    editRecipe.mockRejectedValue(
      new Error(
        "The AI request timed out. Try a smaller form or a simpler edit.",
      ),
    );
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "do a huge edit",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/timed out or failed/i);
  });

  it("surfaces a validation error returned by the apply pipeline", async () => {
    editRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "Here you go.",
    });
    const onApplyRecipe = jest
      .fn()
      .mockResolvedValue({ applied: false, error: "Duplicate field id: email." });
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add another email",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(
      await screen.findByText("Duplicate field id: email."),
    ).toBeInTheDocument();
  });
});

describe("AiSidebar — prompt textarea", () => {
  it("renders the prompt field as a textarea", () => {
    setup();
    const field = screen.getByPlaceholderText(/make the email field required/i);
    expect(field.tagName).toBe("TEXTAREA");
  });

  it("submits on Enter", async () => {
    const recipe = { formId: "contact", steps: [] };
    editRecipe.mockResolvedValue({ recipe, reply: "Done." });
    setup();

    const field = screen.getByPlaceholderText(/make the email field required/i);
    await userEvent.type(field, "make the email field required{Enter}");

    await waitFor(() => expect(editRecipe).toHaveBeenCalledTimes(1));
    expect(editRecipe.mock.calls[0][0].data.message).toBe(
      "make the email field required",
    );
  });

  it("inserts a newline on Shift+Enter without submitting", async () => {
    editRecipe.mockResolvedValue({ recipe: null, reply: "" });
    setup();

    const field = screen.getByPlaceholderText(
      /make the email field required/i,
    ) as HTMLTextAreaElement;
    await userEvent.type(field, "line one{Shift>}{Enter}{/Shift}line two");

    expect(field.value).toBe("line one\nline two");
    expect(editRecipe).not.toHaveBeenCalled();
  });
});

describe("AiSidebar — outcome feedback", () => {
  it("shows an 'applied' status when the recipe is applied", async () => {
    editRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "Done.",
    });
    setup(); // default onApplyRecipe resolves { applied: true }

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add a step",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    // The status must make clear the change is in the editor only, not saved.
    const status = await screen.findByText(/applied to the editor/i);
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/not saved yet/i);
  });

  it("shows an 'unchanged' status when the apply pipeline reports a no-op", async () => {
    editRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "No change needed.",
    });
    const onApplyRecipe = jest
      .fn()
      .mockResolvedValue({ applied: false, reason: "unchanged" });
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "no-op edit",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(
      await screen.findByText(/returned the form unchanged/i),
    ).toBeInTheDocument();
  });

  it("shows no status and no error when the user cancels the apply", async () => {
    editRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: "Here you go.",
    });
    const onApplyRecipe = jest
      .fn()
      .mockResolvedValue({ applied: false, reason: "cancelled" });
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "replace the form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("Here you go.")).toBeInTheDocument();
    expect(screen.queryByText(/applied to the editor/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/returned the form unchanged/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("flags a failed extraction when the reply has a ```json block but recipe is null", async () => {
    editRecipe.mockResolvedValue({
      recipe: null,
      reply: 'Sure:\n```json\n{ "formId": "x" }\n```',
    });
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "build a form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(
      await screen.findByText(/couldn't read it automatically/i),
    ).toBeInTheDocument();
    expect(onApplyRecipe).not.toHaveBeenCalled();
  });

  it("shows no extraction-failed status for a plain conversational reply", async () => {
    editRecipe.mockResolvedValue({ recipe: null, reply: "I can't do that." });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "delete everything",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("I can't do that.")).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't read it automatically/i),
    ).not.toBeInTheDocument();
  });

  it("strips the ```json block from the bubble when a recipe was extracted", async () => {
    editRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply:
        'Added the step.\n```json\n{ "marker": "SHOULD_BE_STRIPPED" }\n```',
    });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add a step",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("Added the step.")).toBeInTheDocument();
    expect(screen.queryByText(/SHOULD_BE_STRIPPED/)).not.toBeInTheDocument();
  });

  it("shows a placeholder when the reply was only a ```json block", async () => {
    editRecipe.mockResolvedValue({
      recipe: { formId: "contact", steps: [] },
      reply: '```json\n{ "marker": "SHOULD_BE_STRIPPED" }\n```',
    });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "build it",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText(/generated a form recipe/i)).toBeInTheDocument();
    expect(screen.queryByText(/SHOULD_BE_STRIPPED/)).not.toBeInTheDocument();
  });
});

describe("AiSidebar — collapse", () => {
  it("collapses and re-expands", async () => {
    setup();
    expect(screen.getByRole("button", { name: /edit form/i })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /collapse ai assistant/i }),
    );
    expect(
      screen.queryByRole("button", { name: /edit form/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /open ai assistant/i }),
    );
    expect(
      screen.getByRole("button", { name: /edit form/i }),
    ).toBeInTheDocument();
  });
});

describe("AiSidebar — Upload", () => {
  // user-event v14 schedules its own micro-delays; without `advanceTimers` it
  // hangs under fake timers. Wire the two together so userEvent.* can flush its
  // queue while we drive the polling clock.
  function setupUser() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  }

  async function pickPdf(
    user: ReturnType<typeof setupUser>,
    name = "form.pdf",
    size = 1024,
  ) {
    const file = new File([new Uint8Array(size)], name, { type: "application/pdf" });
    const input = screen.getByLabelText(/attach pdf/i, {
      selector: "input",
    }) as HTMLInputElement;
    await user.upload(input, file);
  }

  it("runs presign → S3 PUT → process → poll → applies the returned recipe", async () => {
    jest.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "generating" })
      .mockResolvedValueOnce({
        status: "done",
        recipe: { formId: "f", steps: [] },
        reply: "Done.",
        unresolvableRefs: [],
      });
    const { onApplyRecipe } = setup();

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => expect(presignPdfUpload).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://s3/url",
      expect.objectContaining({ method: "PUT" }),
    );
    await waitFor(() =>
      expect(startPdfConvert).toHaveBeenCalledWith({ data: { s3Key: "uploads/abc.pdf" } }),
    );

    // Advance the polling timer three times (processing → generating → done).
    // act() lets React flush the state updates triggered by the resolved status
    // payload.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000); // → processing
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000); // → generating
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000); // → done
    });

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalled());
    jest.useRealTimers();
  });

  it("surfaces the mapped reason when the server reports a password-protected PDF", async () => {
    jest.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({
      status: "failed",
      reason:
        "This PDF appears to be password-protected. Please remove the password and re-upload.",
    });
    setup();

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/password-protected/i),
    );
    jest.useRealTimers();
  });

  it("stops polling when the component unmounts", async () => {
    jest.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    const { unmount } = render(
      <AiSidebar draft={DRAFT} version="1.0.0" onApplyRecipe={jest.fn()} />,
    );

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });

    const callsBeforeUnmount = getPdfConvertStatus.mock.calls.length;
    unmount();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(getPdfConvertStatus.mock.calls.length).toBe(callsBeforeUnmount);
    jest.useRealTimers();
  });

  it("times out after 3 minutes with a friendly error", async () => {
    jest.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    setup();

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3 * 60_000 + 2000);
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/taking longer than expected/i),
    );
    jest.useRealTimers();
  });

  it("passes the typed prompt as context, clears the box, and shows it in the transcript", async () => {
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    setup();

    const box = screen.getByPlaceholderText(/make the email field required/i);
    await user.type(box, "make every field optional");
    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() =>
      expect(startPdfConvert).toHaveBeenCalledWith({
        data: { s3Key: "uploads/abc.pdf", context: "make every field optional" },
      }),
    );
    // The box is cleared once the context rides along with the upload.
    expect((box as HTMLTextAreaElement).value).toBe("");
    // The transcript bubble reflects both the file and the typed context.
    expect(
      screen.getByText(/📎 Uploaded.*make every field optional/s),
    ).toBeInTheDocument();
  });

  it("restores the typed context to the box when the upload fails", async () => {
    const user = setupUser();
    presignPdfUpload.mockRejectedValue(
      new Error("Upload failed — please refresh and try again."),
    );
    setup();

    const box = screen.getByPlaceholderText(/make the email field required/i);
    await user.type(box, "skip the payment page");
    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/upload failed/i),
    );
    // The context is back in the box so the user doesn't have to retype it.
    expect((box as HTMLTextAreaElement).value).toBe("skip the payment page");
  });

  it("omits context and keeps the box untouched when the prompt is empty", async () => {
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    setup();

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() =>
      expect(startPdfConvert).toHaveBeenCalledWith({ data: { s3Key: "uploads/abc.pdf" } }),
    );
  });
});
