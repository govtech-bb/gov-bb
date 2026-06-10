/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// The convert server-fn family is createServerFn (ESM + RPC at module-eval); stub each.
const startEditRecipe = jest.fn();
const getEditStatus = jest.fn();
const presignPdfUpload = jest.fn();
const startPdfConvert = jest.fn();
const getPdfConvertStatus = jest.fn();

jest.mock("../../server/ai-builder/convert", () => ({
  startEditRecipe: (...args: unknown[]) => startEditRecipe(...args),
  getEditStatus: (...args: unknown[]) => getEditStatus(...args),
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
  startEditRecipe.mockReset();
  getEditStatus.mockReset();
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

// Edit Form is now an async job: startEditRecipe → poll getEditStatus. The
// first poll fires at ~400ms (real timers), well inside findByText/waitFor's
// 1s window, so most tests can return a terminal status on the first poll and
// stay on real timers. `doneStatus` builds the terminal "done" payload.
function doneStatus(
  recipe: Record<string, unknown> | null,
  reply: string,
  unresolvableRefs: unknown[] = [],
) {
  return { status: "done", recipe, reply, unresolvableRefs };
}

describe("AiSidebar — Edit Form", () => {
  it("starts an edit job with the message + serialized draft and applies the returned recipe", async () => {
    const recipe = { formId: "contact", steps: [] };
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus(recipe, "Done — email is now required."),
    );
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "make the email field required",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    await waitFor(() => expect(startEditRecipe).toHaveBeenCalledTimes(1));
    const arg = startEditRecipe.mock.calls[0][0];
    expect(arg.data.message).toBe("make the email field required");
    // The current draft rides along as serialized recipe JSON.
    expect(JSON.parse(arg.data.recipeJson).formId).toBe("contact");

    // The job id from start is polled for status.
    await waitFor(() =>
      expect(getEditStatus).toHaveBeenCalledWith({ data: { jobId: "edit-1" } }),
    );

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalledWith(recipe, []));
    expect(screen.getByText("make the email field required")).toBeInTheDocument();
    expect(
      await screen.findByText("Done — email is now required."),
    ).toBeInTheDocument();
  });

  it("forwards unresolvableRefs from the status response to the apply pipeline", async () => {
    const recipe = { formId: "contact", steps: [] };
    const unresolvableRefs = [
      { ref: "components/generic/text", path: "steps[step-1].elements[0].ref" },
    ];
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus(recipe, "Built it.", unresolvableRefs),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(doneStatus(null, "I can't do that."));
    const { onApplyRecipe } = setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "delete everything",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    expect(await screen.findByText("I can't do that.")).toBeInTheDocument();
    expect(onApplyRecipe).not.toHaveBeenCalled();
  });

  it("shows the failure reason when the edit job fails", async () => {
    // The async edit can't 504 anymore — a failed Bedrock generation comes back
    // as a terminal { status: "failed", reason } the user sees verbatim.
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue({
      status: "failed",
      reason: "The model could not produce a valid recipe. Please rephrase.",
    });
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "rebuild the entire 40-field form",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not produce a valid recipe/i);
  });

  it("shows an interrupted message when the edit session is not found (404)", async () => {
    // A single-task restart mid-edit loses the in-memory job; the next status
    // poll 404s, surfaced by the API client as the expired-session message.
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockRejectedValue(
      new Error("This edit session expired — please try again."),
    );
    setup();

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "do a huge edit",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/edit session expired/i);
  });

  it("surfaces a validation error returned by the apply pipeline", async () => {
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus({ formId: "contact", steps: [] }, "Here you go."),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(doneStatus(recipe, "Done."));
    setup();

    const field = screen.getByPlaceholderText(/make the email field required/i);
    await userEvent.type(field, "make the email field required{Enter}");

    await waitFor(() => expect(startEditRecipe).toHaveBeenCalledTimes(1));
    expect(startEditRecipe.mock.calls[0][0].data.message).toBe(
      "make the email field required",
    );
  });

  it("inserts a newline on Shift+Enter without submitting", async () => {
    setup();

    const field = screen.getByPlaceholderText(
      /make the email field required/i,
    ) as HTMLTextAreaElement;
    await userEvent.type(field, "line one{Shift>}{Enter}{/Shift}line two");

    expect(field.value).toBe("line one\nline two");
    expect(startEditRecipe).not.toHaveBeenCalled();
  });
});

describe("AiSidebar — outcome feedback", () => {
  it("shows an 'applied' status when the recipe is applied", async () => {
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus({ formId: "contact", steps: [] }, "Done."),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus({ formId: "contact", steps: [] }, "No change needed."),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus({ formId: "contact", steps: [] }, "Here you go."),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus(null, 'Sure:\n```json\n{ "formId": "x" }\n```'),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(doneStatus(null, "I can't do that."));
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus(
        { formId: "contact", steps: [] },
        'Added the step.\n```json\n{ "marker": "SHOULD_BE_STRIPPED" }\n```',
      ),
    );
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
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus(
        { formId: "contact", steps: [] },
        '```json\n{ "marker": "SHOULD_BE_STRIPPED" }\n```',
      ),
    );
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
});
