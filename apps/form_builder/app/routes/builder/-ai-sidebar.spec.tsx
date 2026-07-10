/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// The convert server-fn family is createServerFn (ESM + RPC at module-eval); stub each.
const startEditRecipe = vi.fn();
const getEditStatus = vi.fn();
const presignPdfUpload = vi.fn();
const startPdfConvert = vi.fn();
const getPdfConvertStatus = vi.fn();

vi.mock("../../server/ai-builder/convert", () => ({
  startEditRecipe: (...args: unknown[]) => startEditRecipe(...args),
  getEditStatus: (...args: unknown[]) => getEditStatus(...args),
  presignPdfUpload: (...args: unknown[]) => presignPdfUpload(...args),
  startPdfConvert: (...args: unknown[]) => startPdfConvert(...args),
  getPdfConvertStatus: (...args: unknown[]) => getPdfConvertStatus(...args),
}));

// Stub global fetch for the direct browser → S3 PUT. jsdom (the test env) ships
// neither fetch nor Response, so install a plain mock and a duck-typed fake
// response — the sidebar only reads `.ok` off the result.
const okResponse = { ok: true, status: 200 } as unknown as Response;
const fetchSpy = vi.fn(async () => okResponse);
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

function setup(onApplyRecipe = vi.fn().mockResolvedValue({ applied: true })) {
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

describe("AiSidebar — apply failure + Retry apply (#1532 #1871 #1873)", () => {
  // A *rejection* of onApplyRecipe (the editor pipeline crashed, distinct from
  // a resolved { error } validation verdict) must surface an apply-specific
  // message and offer a Retry apply action that re-applies the stashed recipe
  // from memory — no re-run of the billed generation.
  const RECIPE = { formId: "contact", steps: [] };

  // Drives the edit path up to a rejected apply and returns the retry button.
  async function editToApplyFailure(
    onApplyRecipe: Parameters<typeof setup>[0],
    unresolvableRefs: unknown[] = [],
  ) {
    startEditRecipe.mockResolvedValue({ jobId: "edit-1" });
    getEditStatus.mockResolvedValue(
      doneStatus(RECIPE, "Here you go.", unresolvableRefs),
    );
    setup(onApplyRecipe);

    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "add a step",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));
    return await screen.findByRole("button", { name: /retry apply/i });
  }

  it("shows an apply-specific error, not the raw rejection, when apply rejects on the edit path (#1871)", async () => {
    const onApplyRecipe = vi
      .fn()
      .mockRejectedValue(new Error("editor pipeline crashed"));
    await editToApplyFailure(onApplyRecipe);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn't apply the recipe to the editor/i);
    // Pre-fix behavior routed the rejection through the generic edit catch.
    expect(alert).not.toHaveTextContent(/editor pipeline crashed/i);
  });

  it("retries with the stashed recipe + refs without re-calling any AI/upload server fn", async () => {
    const unresolvableRefs = [
      { ref: "components/generic/text", path: "steps[step-1].elements[0].ref" },
    ];
    const onApplyRecipe = vi.fn().mockRejectedValue(new Error("boom"));
    const retry = await editToApplyFailure(onApplyRecipe, unresolvableRefs);

    await userEvent.click(retry);

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalledTimes(2));
    expect(onApplyRecipe).toHaveBeenNthCalledWith(2, RECIPE, unresolvableRefs);
    expect(startEditRecipe).toHaveBeenCalledTimes(1);
    expect(presignPdfUpload).not.toHaveBeenCalled();
    expect(startPdfConvert).not.toHaveBeenCalled();
  });

  it("clears the error and pending state and reports applied when the retry succeeds", async () => {
    const onApplyRecipe = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ applied: true });
    const retry = await editToApplyFailure(onApplyRecipe);

    await userEvent.click(retry);

    expect(await screen.findByText(/applied to the editor/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry apply/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the error and the retry action when the retry rejects again", async () => {
    const onApplyRecipe = vi.fn().mockRejectedValue(new Error("boom"));
    const retry = await editToApplyFailure(onApplyRecipe);

    await userEvent.click(retry);

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't apply the recipe to the editor/i,
    );
    expect(
      screen.getByRole("button", { name: /retry apply/i }),
    ).toBeInTheDocument();
  });

  it("keeps the retry action when the retried apply is cancelled at the overwrite prompt", async () => {
    // Declining the dirty-form confirm resolves { reason: "cancelled" } — the
    // stash must survive so the user can still retry after saving, instead of
    // being forced back through a billed regeneration.
    const onApplyRecipe = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ applied: false, reason: "cancelled" });
    const retry = await editToApplyFailure(onApplyRecipe);

    await userEvent.click(retry);

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: /retry apply/i }),
    ).toBeInTheDocument();
  });

  it("disables Retry apply and blocks new jobs while a retry is in flight", async () => {
    // The apply pipeline is NOT synchronous — it validates over the network
    // before any confirm — so an unguarded window lets a double-click fire two
    // applies, or a fresh job start whose state the stale retry then clobbers.
    let resolveRetry!: (value: unknown) => void;
    const onApplyRecipe = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementationOnce(() => new Promise((r) => (resolveRetry = r)));
    const retry = await editToApplyFailure(onApplyRecipe);

    await userEvent.click(retry);

    // In flight: the retry button and both job starters are locked out.
    expect(retry).toBeDisabled();
    await userEvent.click(retry); // no-op — must not fire a second apply
    expect(screen.getByRole("button", { name: /edit form/i })).toBeDisabled();
    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "another edit",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));
    expect(startEditRecipe).toHaveBeenCalledTimes(1);
    expect(onApplyRecipe).toHaveBeenCalledTimes(2);

    resolveRetry({ applied: true });
    expect(await screen.findByText(/applied to the editor/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry apply/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the pending retry and error when a new edit job starts", async () => {
    const onApplyRecipe = vi.fn().mockRejectedValue(new Error("boom"));
    await editToApplyFailure(onApplyRecipe);

    // Second job hangs in "processing" so we can observe the cleared state
    // right after the job starts.
    getEditStatus.mockResolvedValue({ status: "processing" });
    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      "another edit",
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));

    await waitFor(() => expect(startEditRecipe).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("button", { name: /retry apply/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    return userEvent.setup({
      // vitest throws (jest no-ops) if timers are advanced while real —
      // some suites in this file run with real timers.
      advanceTimers: (ms) => {
        if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
      },
    });
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
    vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(2000); // → processing
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000); // → generating
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000); // → done
    });

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalled());
    vi.useRealTimers();
  });

  it("surfaces the mapped reason when the server reports a password-protected PDF", async () => {
    vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/password-protected/i),
    );
    vi.useRealTimers();
  });

  it("stops polling when the component unmounts", async () => {
    vi.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    const { unmount } = render(
      <AiSidebar draft={DRAFT} version="1.0.0" onApplyRecipe={vi.fn()} />,
    );

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const callsBeforeUnmount = getPdfConvertStatus.mock.calls.length;
    unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getPdfConvertStatus.mock.calls.length).toBe(callsBeforeUnmount);
    vi.useRealTimers();
  });

  it("times out after 3 minutes with a friendly error", async () => {
    vi.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({ status: "processing" });
    setup();

    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60_000 + 2000);
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/taking longer than expected/i),
    );
    vi.useRealTimers();
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

  it("shows an apply-specific error, not an upload error, when apply rejects after a successful convert (#1532)", async () => {
    vi.useFakeTimers();
    const user = setupUser();
    presignPdfUpload.mockResolvedValue({ url: "https://s3/url", s3Key: "uploads/abc.pdf" });
    startPdfConvert.mockResolvedValue({ jobId: "job-1" });
    getPdfConvertStatus.mockResolvedValue({
      status: "done",
      recipe: { formId: "f", steps: [] },
      reply: "Done.",
      unresolvableRefs: [],
    });
    const onApplyRecipe = vi
      .fn()
      .mockRejectedValue(new Error("editor pipeline crashed"));
    setup(onApplyRecipe);

    // Typed context rides along with the upload; a *successful* upload consumes
    // it, so an apply failure must NOT restore it to the box (the restore is
    // for genuine upload failures only).
    const box = screen.getByPlaceholderText(/make the email field required/i);
    await user.type(box, "make every field optional");
    await pickPdf(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000); // → done
    });

    await waitFor(() => expect(onApplyRecipe).toHaveBeenCalled());
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/couldn't apply the recipe to the editor/i);
      expect(alert).not.toHaveTextContent(/upload failed/i);
      expect(alert).not.toHaveTextContent(/editor pipeline crashed/i);
    });
    expect(
      screen.getByRole("button", { name: /retry apply/i }),
    ).toBeInTheDocument();
    expect((box as HTMLTextAreaElement).value).toBe("");
    vi.useRealTimers();
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
