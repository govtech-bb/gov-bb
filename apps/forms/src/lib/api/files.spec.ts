import {
  presignUpload,
  confirmUpload,
  putFileToS3,
  uploadFile,
  FileUploadError,
  UPLOAD_PROBLEM_MESSAGE,
} from "./files";

const API_URL = "http://localhost:3001";

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
}

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
    expect(FakeXhr.last.headers).toEqual({
      "Content-Type": "application/octet-stream",
    });
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
});
