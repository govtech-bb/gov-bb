import {
  presignUpload,
  confirmUpload,
  putFileToS3,
  sendFile,
  checkFile,
  FileUploadError,
  REQUEST_TIMEOUT_MS,
  SCAN_RECHECK_INTERVAL_MS,
  UPLOAD_IN_PROGRESS_MESSAGE,
  UPLOAD_NOT_ADDED_MESSAGE,
  UPLOAD_PROBLEM_MESSAGE,
} from "./files";

const API_URL = "http://localhost:3001";

// The widget's full flow: send, then check. Lets the end-to-end cases below
// assert the order and headers of every request.
const uploadFile = async (params: Parameters<typeof sendFile>[0]) =>
  checkFile({ ...params, key: await sendFile(params) });

const presignOk = {
  uploadUrl: "https://s3/put?sig=1",
  key: "uploads/k",
  expiresIn: 900,
  maxSize: 10485760,
};

/**
 * Stands in for XMLHttpRequest, which the S3 PUT uses for progress events.
 * `respond` decides how each request ends; by default it succeeds.
 */
class FakeXhr {
  static last: FakeXhr;
  static respond: (xhr: FakeXhr) => void;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  upload: { onprogress?: (e: ProgressEvent) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  ontimeout?: () => void;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.last = this;
    queueMicrotask(() => FakeXhr.respond(this));
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent);
  }
  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
  aborted = false;
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

/** A fetch that never answers, but rejects like fetch does when aborted. */
const hangingFetch = (_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({ status: "success", message: "", data }),
  } as unknown as Response;
}

describe("files API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    FakeXhr.respond = (xhr) => xhr.finish(200);
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const presignReq = {
    formId: "apply-for-conductor-licence",
    formVersion: "1.0.0",
    stepId: "document-uploads",
    fieldId: "police-certificate",
    fileName: "police-cert.pdf",
    contentType: "application/pdf",
    size: 524288,
  };

  it("presignUpload POSTs to /files/presign-upload and unwraps data", async () => {
    const payload = {
      uploadUrl: "https://s3/put?sig=1",
      key: "uploads/k",
      expiresIn: 900,
      maxSize: 10485760,
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const result = await presignUpload(presignReq);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/files/presign-upload`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(presignReq),
        // Sends the shared `preview` cookie cross-origin so a non-public form
        // resolves after the URL token drops (#2116).
        credentials: "include",
      }),
    );
    expect(result).toEqual(payload);
  });

  it("presignUpload sets the X-Recipe-Preview header when a token is passed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await presignUpload(presignReq, "preview-tok");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/files/presign-upload`,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Recipe-Preview": "preview-tok",
        },
      }),
    );
  });

  it("presignUpload omits the X-Recipe-Preview header when no token is passed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await presignUpload(presignReq);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/files/presign-upload`,
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("confirmUpload sets the X-Recipe-Preview header when a token is passed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await confirmUpload(
      {
        key: "uploads/k",
        formId: "f",
        formVersion: "1.0.0",
        stepId: "s",
        fieldId: "fld",
      },
      "preview-tok",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/files/confirm-upload`,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Recipe-Preview": "preview-tok",
        },
      }),
    );
  });

  it("presignUpload sets the X-Recipe-Draft header when a draft token is passed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await presignUpload(presignReq, undefined, "draft-tok");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/files/presign-upload`,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Recipe-Draft": "draft-tok",
        },
      }),
    );
  });

  it("uploadFile threads the draft token to both presign and confirm", async () => {
    const presign = {
      uploadUrl: "https://s3/put?sig=1",
      key: "uploads/k",
      expiresIn: 900,
      maxSize: 10485760,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presign)) // presign
      .mockResolvedValueOnce(jsonResponse({})); // confirm

    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await uploadFile({
      file,
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fld",
      draftToken: "draft-tok",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/files/presign-upload`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Recipe-Draft": "draft-tok" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/files/confirm-upload`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Recipe-Draft": "draft-tok" }),
      }),
    );
  });

  it("uploadFile threads the preview token to both presign and confirm", async () => {
    const presign = {
      uploadUrl: "https://s3/put?sig=1",
      key: "uploads/k",
      expiresIn: 900,
      maxSize: 10485760,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presign)) // presign
      .mockResolvedValueOnce(jsonResponse({})); // confirm

    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await uploadFile({
      file,
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fld",
      previewToken: "preview-tok",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/files/presign-upload`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Recipe-Preview": "preview-tok" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/files/confirm-upload`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Recipe-Preview": "preview-tok" }),
      }),
    );
  });

  it("confirmUpload POSTs to /files/confirm-upload and returns the attachment", async () => {
    const attachment = {
      key: "uploads/k",
      url: "https://s3/get?sig=2",
      name: "police-cert.pdf",
      size: 524288,
      type: "application/pdf",
    };
    fetchMock.mockResolvedValue(jsonResponse(attachment));

    const result = await confirmUpload({
      key: "uploads/k",
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fld",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/files/confirm-upload`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(attachment);
  });

  it("putFileToS3 PUTs the file with the matching Content-Type", async () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    await putFileToS3("https://s3/put?sig=1", file);

    expect(FakeXhr.last).toMatchObject({
      method: "PUT",
      url: "https://s3/put?sig=1",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
  });

  // The API will sign If-None-Match into the URL (#3332), so the browser must
  // already send it, or every PUT would fail with SignatureDoesNotMatch.
  it("putFileToS3 asks S3 to write only if nothing is at the key yet", async () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    await putFileToS3("https://s3/put?sig=1", file);

    expect(FakeXhr.last?.headers["If-None-Match"]).toBe("*");
  });

  // fetch can't report upload progress; XHR's upload.onprogress can (#2940).
  it("putFileToS3 reports upload progress as a fraction", async () => {
    FakeXhr.respond = (xhr) => {
      xhr.progress(25, 100);
      xhr.progress(100, 100);
      xhr.finish(200);
    };
    const onProgress = vi.fn();

    await putFileToS3("https://s3/put", new File(["x"], "a.pdf"), onProgress);

    expect(onProgress.mock.calls).toEqual([[0.25], [1]]);
  });

  it("putFileToS3 throws a FileUploadError(put) on a non-ok response", async () => {
    FakeXhr.respond = (xhr) => xhr.finish(403);
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    await expect(putFileToS3("https://s3/put", file)).rejects.toMatchObject({
      name: "FileUploadError",
      stage: "put",
    });
  });

  it("putFileToS3 throws a FileUploadError(put) when the connection drops", async () => {
    FakeXhr.respond = (xhr) => xhr.fail();

    await expect(
      putFileToS3("https://s3/put", new File(["x"], "a.pdf")),
    ).rejects.toMatchObject({ name: "FileUploadError", stage: "put" });
  });

  // #2422: the citizen saw "File upload failed (presign)". Whatever stage
  // fails, they get the one agreed message, with no internal stage name.
  it.each([
    ["presign network error", () => fetchMock.mockRejectedValue(new Error())],
    [
      "presign 500",
      () => fetchMock.mockResolvedValue(jsonResponse({}, false, 500)),
    ],
    [
      "confirm 429",
      () =>
        fetchMock
          .mockResolvedValueOnce(jsonResponse(presignOk))
          .mockResolvedValueOnce(jsonResponse({}, false, 429)),
    ],
    [
      "PUT 403",
      () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(presignOk));
        FakeXhr.respond = (xhr) => xhr.finish(403);
      },
    ],
  ])("shows the agreed message on a %s", async (_case, arrange) => {
    arrange();
    const error = await uploadFile({
      file: new File(["x"], "a.pdf", { type: "application/pdf" }),
      formId: "f",
      stepId: "s",
      fieldId: "fld",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FileUploadError);
    expect((error as Error).message).toBe(UPLOAD_PROBLEM_MESSAGE);
    expect((error as Error).message).not.toMatch(/presign|put|confirm/i);
  });

  it("presignUpload throws FileUploadError(presign) on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(presignUpload(presignReq)).rejects.toBeInstanceOf(
      FileUploadError,
    );
  });

  it("uploadFile runs presign → PUT → confirm in order and returns the attachment", async () => {
    const presign = {
      uploadUrl: "https://s3/put?sig=1",
      key: "uploads/k",
      expiresIn: 900,
      maxSize: 10485760,
    };
    const attachment = {
      key: "uploads/k",
      url: "https://s3/get?sig=2",
      name: "a.pdf",
      size: 1,
      type: "application/pdf",
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presign)) // presign
      .mockResolvedValueOnce(jsonResponse(attachment)); // confirm

    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    const result = await uploadFile({
      file,
      formId: "f",
      formVersion: "1.0.0",
      stepId: "s",
      fieldId: "fld",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/files/presign-upload`,
      expect.anything(),
    );
    expect(FakeXhr.last).toMatchObject({
      method: "PUT",
      url: presign.uploadUrl,
      body: file,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/files/confirm-upload`,
      expect.anything(),
    );
    expect(result).toEqual(attachment);
  });

  // A browser reports an empty `type` for a file whose extension it cannot map
  // (a scan saved without an extension, an unrecognised document). Presign's
  // DTO requires a MIME type, so an untyped file used to 400 there and the
  // field could never be filled — most visibly on an upload with no
  // `fileTypes`, whose picker isn't constrained to types the browser always
  // recognises.
  it("uploadFile falls back to application/octet-stream when the browser reports no type", async () => {
    const presign = {
      uploadUrl: "https://s3/put?sig=1",
      key: "uploads/k",
      expiresIn: 900,
      maxSize: 10485760,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(presign)) // presign
      .mockResolvedValueOnce(jsonResponse({})); // confirm

    const file = new File(["x"], "qualification-scan", { type: "" });
    await uploadFile({ file, formId: "f", stepId: "s", fieldId: "fld" });

    const presignBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    ) as { contentType: string };
    expect(presignBody.contentType).toBe("application/octet-stream");

    // S3 signs the content type, so the PUT header has to match what presign
    // signed — sending the empty original here fails with SignatureDoesNotMatch.
    expect(FakeXhr.last.headers["Content-Type"]).toBe(
      "application/octet-stream",
    );
  });

  it("uploadFile surfaces a presign failure without PUTting", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400)); // presign 400
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    await expect(
      uploadFile({
        file,
        formId: "f",
        formVersion: "1.0.0",
        stepId: "s",
        fieldId: "fld",
      }),
    ).rejects.toMatchObject({ stage: "presign" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sendFile presigns and PUTs, and returns the key without confirming", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(presignOk));
    const onProgress = vi.fn();
    FakeXhr.respond = (xhr) => {
      xhr.progress(1, 2);
      xhr.finish(200);
    };

    const key = await sendFile({
      file: new File(["x"], "a.pdf", { type: "application/pdf" }),
      formId: "f",
      stepId: "s",
      fieldId: "fld",
      onProgress,
    });

    expect(key).toBe("uploads/k");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });

  describe("checkFile", () => {
    const ref = { key: "uploads/k", formId: "f", stepId: "s", fieldId: "fld" };
    const confirmed = (scanStatus?: string) =>
      jsonResponse({
        key: "uploads/k",
        name: "a.pdf",
        size: 1,
        type: "x",
        scanStatus,
      });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(["clean", "infected", "unscannable"])(
      "returns a %s verdict from the first confirm",
      async (verdict) => {
        fetchMock.mockResolvedValue(confirmed(verdict));

        await expect(checkFile(ref)).resolves.toMatchObject({
          scanStatus: verdict,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );

    // An API older than #3333 sends no verdict; the widget treats it as clean.
    it("returns at once when confirm sends no verdict", async () => {
      fetchMock.mockResolvedValue(confirmed());

      const result = await checkFile(ref);

      expect(result).toMatchObject({ key: "uploads/k" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("asks again every 3s while the scan is pending", async () => {
      fetchMock
        .mockResolvedValueOnce(confirmed("pending"))
        .mockResolvedValueOnce(confirmed("pending"))
        .mockResolvedValueOnce(confirmed("clean"));

      const result = checkFile(ref);
      await vi.advanceTimersByTimeAsync(2999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3000);

      await expect(result).resolves.toMatchObject({ scanStatus: "clean" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    // Pending must never spin forever: after 20s the widget shows "took too
    // long" with Retry. Asks at 0, 3, 6 ... 18s; the next would pass 20s.
    it("gives up with timeout once 20s would pass", async () => {
      fetchMock.mockResolvedValue(confirmed("pending"));

      const result = checkFile(ref);
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(result).resolves.toBe("timeout");
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    it("stops and throws when a re-check fails", async () => {
      fetchMock
        .mockResolvedValueOnce(confirmed("pending"))
        .mockResolvedValueOnce(jsonResponse({}, false, 429));

      const result = checkFile(ref).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(3000);

      await expect(result).resolves.toMatchObject({ stage: "confirm" });
    });
  });

  // A stalled request must end, so the row can offer Retry instead of
  // "Checking your file" forever behind a blocked Continue (#2940).
  // Content design (Fab) approved this wording on #2940. Shown when Continue
  // is pressed before a file is ready.
  describe("Continue messages", () => {
    it("asks the person to wait while a file uploads or is checked", () => {
      expect(UPLOAD_IN_PROGRESS_MESSAGE).toBe("Wait until your file is ready.");
    });

    it("asks the person to remove or retry a file that can be retried", () => {
      expect(UPLOAD_NOT_ADDED_MESSAGE).toBe("Remove the file or try again.");
    });
  });

  describe("stopping a request", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const ref = { key: "uploads/k", formId: "f", stepId: "s", fieldId: "fld" };

    it("gives up on a confirm that doesn't answer within the request timeout", async () => {
      fetchMock.mockImplementation(hangingFetch);

      const result = checkFile(ref).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

      await expect(result).resolves.toMatchObject({
        name: "FileUploadError",
        message: UPLOAD_PROBLEM_MESSAGE,
      });
    });

    // The timer must cover the body too: headers can arrive and the body
    // stall, which would leave the row on "Checking your file" for good.
    it("gives up on a confirm whose body doesn't arrive within the request timeout", async () => {
      fetchMock.mockImplementation((_url: string, init: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () =>
                reject(new DOMException("aborted", "AbortError")),
              );
            }),
        } as unknown as Response),
      );

      const result = checkFile(ref).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

      await expect(result).resolves.toMatchObject({
        name: "FileUploadError",
        message: UPLOAD_PROBLEM_MESSAGE,
      });
    });

    it("cancels the confirm when the caller aborts", async () => {
      fetchMock.mockImplementation(hangingFetch);
      const run = new AbortController();

      const result = checkFile({ ...ref, signal: run.signal }).catch(
        (e: unknown) => e,
      );
      run.abort();

      await expect(result).resolves.toBeInstanceOf(FileUploadError);
    });

    it("stops re-checking when the caller aborts between checks", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ key: "uploads/k", scanStatus: "pending" }),
      );
      const run = new AbortController();

      const result = checkFile({ ...ref, signal: run.signal }).catch(
        (e: unknown) => e,
      );
      await vi.advanceTimersByTimeAsync(1000);
      run.abort();
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(result).resolves.toBeInstanceOf(FileUploadError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("stops waiting between checks as soon as the caller aborts", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ key: "uploads/k", scanStatus: "pending" }),
      );
      const run = new AbortController();
      let settled = false;

      const result = checkFile({ ...ref, signal: run.signal })
        .catch((e: unknown) => e)
        .finally(() => (settled = true));
      await vi.advanceTimersByTimeAsync(1000);
      run.abort();
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(true);
      await expect(result).resolves.toBeInstanceOf(FileUploadError);
    });

    // A wait that runs its course mustn't leave its cancel listener behind on
    // the run's signal, one per re-check.
    it("drops its cancel listener once a wait between checks ends", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ key: "uploads/k", scanStatus: "pending" }),
        )
        .mockResolvedValue(
          jsonResponse({ key: "uploads/k", scanStatus: "clean" }),
        );
      const run = new AbortController();
      const added = vi.spyOn(run.signal, "addEventListener");
      const removed = vi.spyOn(run.signal, "removeEventListener");

      const result = checkFile({ ...ref, signal: run.signal });
      await vi.advanceTimersByTimeAsync(SCAN_RECHECK_INTERVAL_MS);
      await result;

      const waitListener = added.mock.calls.find(
        ([, , opts]) => typeof opts === "object" && opts?.once,
      )?.[1];
      expect(waitListener).toBeDefined();
      expect(removed).toHaveBeenCalledWith("abort", waitListener);
    });

    // A cancel can land while presign's body is read, so the PUT can start
    // with a signal that is already aborted, whose abort event never fires.
    it("never sends the file when the caller has already cancelled", async () => {
      const send = vi.spyOn(FakeXhr.prototype, "send");
      const run = new AbortController();
      run.abort();

      const result = putFileToS3(
        "https://s3/put",
        new File(["x"], "a.pdf"),
        undefined,
        run.signal,
      ).catch((e: unknown) => e);

      await expect(result).resolves.toBeInstanceOf(FileUploadError);
      expect(send).not.toHaveBeenCalled();
      send.mockRestore();
    });

    it("aborts the S3 PUT when the caller aborts", async () => {
      FakeXhr.respond = () => {}; // never finishes on its own
      const run = new AbortController();

      const result = putFileToS3(
        "https://s3/put",
        new File(["x"], "a.pdf"),
        undefined,
        run.signal,
      ).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(0);
      run.abort();

      await expect(result).resolves.toBeInstanceOf(FileUploadError);
      expect(FakeXhr.last.aborted).toBe(true);
    });
  });
});
