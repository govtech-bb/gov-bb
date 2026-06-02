import {
  presignUpload,
  confirmUpload,
  putFileToS3,
  uploadFile,
  FileUploadError,
} from "./files";

const API_URL = "http://localhost:3001";

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({ status: "success", message: "", data }),
  } as unknown as Response;
}

describe("files API client", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
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
      }),
    );
    expect(result).toEqual(payload);
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
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    await putFileToS3("https://s3/put?sig=1", file);

    expect(fetchMock).toHaveBeenCalledWith("https://s3/put?sig=1", {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
  });

  it("putFileToS3 throws a FileUploadError(put) on a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 } as Response);
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });

    await expect(putFileToS3("https://s3/put", file)).rejects.toMatchObject({
      name: "FileUploadError",
      stage: "put",
    });
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
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response) // PUT
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      presign.uploadUrl,
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${API_URL}/files/confirm-upload`,
      expect.anything(),
    );
    expect(result).toEqual(attachment);
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
