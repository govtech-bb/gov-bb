import { fileTypesRunner, itemMaxSizeRunner, maxSizeRunner } from "./file";

const cfg = (value?: unknown, error?: string) => ({ value, error });

const file = (name: string, size: number, type?: string) => ({
  name,
  size,
  type,
});

describe("fileTypesRunner", () => {
  it("passes when all files have allowed extension", () => {
    expect(
      fileTypesRunner(
        [file("doc.pdf", 100, "application/pdf")],
        cfg([".pdf", ".jpg"]),
        {},
      ),
    ).toBeNull();
  });

  it("passes when file mime type matches", () => {
    expect(
      fileTypesRunner(
        [file("image.jpg", 100, ".jpg")],
        cfg([".pdf", ".jpg"]),
        {},
      ),
    ).toBeNull();
  });

  it("fails when file extension not in allowed list", () => {
    expect(
      fileTypesRunner([file("virus.exe", 100)], cfg([".pdf", ".jpg"]), {}),
    ).toBe("Allowed file types: .pdf, .jpg");
  });

  it("passes for empty file list", () => {
    expect(fileTypesRunner([], cfg([".pdf"]), {})).toBeNull();
  });

  it("returns null when config.value is not an array", () => {
    expect(
      fileTypesRunner([file("a.exe", 100)], cfg(undefined), {}),
    ).toBeNull();
  });

  it("uses custom error", () => {
    expect(
      fileTypesRunner([file("bad.exe", 100)], cfg([".pdf"], "Bad type"), {}),
    ).toBe("Bad type");
  });

  it("returns an error when first file passes but second file fails", () => {
    expect(
      fileTypesRunner(
        [file("ok.pdf", 100), file("bad.exe", 200)],
        cfg([".pdf", ".jpg"]),
        {},
      ),
    ).toBe("Allowed file types: .pdf, .jpg");
  });
});

describe("itemMaxSizeRunner", () => {
  it("passes when all files are within size limit", () => {
    expect(
      itemMaxSizeRunner(
        [file("a.pdf", 500), file("b.pdf", 1000)],
        cfg(1000),
        {},
      ),
    ).toBeNull();
  });

  it("fails when any file exceeds size limit", () => {
    expect(
      itemMaxSizeRunner(
        [file("a.pdf", 500), file("b.pdf", 1001)],
        cfg(1000),
        {},
      ),
    ).toBe("Each file must be at most 1000 bytes");
  });

  it("passes for empty file list", () => {
    expect(itemMaxSizeRunner([], cfg(100), {})).toBeNull();
  });

  it("uses custom error", () => {
    expect(
      itemMaxSizeRunner([file("a.pdf", 9999)], cfg(100, "File too big"), {}),
    ).toBe("File too big");
  });
});

describe("maxSizeRunner", () => {
  it("passes when total size is within limit", () => {
    expect(
      maxSizeRunner([file("a.pdf", 400), file("b.pdf", 600)], cfg(1000), {}),
    ).toBeNull();
  });

  it("fails when total size exceeds limit", () => {
    expect(
      maxSizeRunner([file("a.pdf", 600), file("b.pdf", 500)], cfg(1000), {}),
    ).toBe("Total file size must be at most 1000 bytes");
  });

  it("passes for empty file list", () => {
    expect(maxSizeRunner([], cfg(1000), {})).toBeNull();
  });

  it("uses custom error", () => {
    expect(
      maxSizeRunner([file("a.pdf", 9999)], cfg(100, "Too large total"), {}),
    ).toBe("Too large total");
  });
});
