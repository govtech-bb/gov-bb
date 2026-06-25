import type { Block } from "@aws-sdk/client-textract";
import { blocksToText, startAnalysis, getAnalysisResult } from "./textract";
import simpleForm from "./__fixtures__/textract/simple-form.json";
import checkboxes from "./__fixtures__/textract/checkboxes.json";
import multiPage from "./__fixtures__/textract/multi-page.json";
import empty from "./__fixtures__/textract/empty.json";
import tableFixture from "./__fixtures__/textract/table.json";

const blocksOf = (f: { Blocks: unknown[] }) => f.Blocks as Block[];

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-textract", () => {
  return {
    TextractClient: vi.fn(function () {
      return {
        send: (...args: unknown[]) => sendMock(...args),
      };
    }),
    StartDocumentAnalysisCommand: vi.fn(function (args) {
      return { name: "Start", args };
    }),
    GetDocumentAnalysisCommand: vi.fn(function (args) {
      return { name: "Get", args };
    }),
  };
});

beforeEach(() => {
  sendMock.mockReset();
  process.env.S3_BUCKET = "form-builder-uploads-sandbox-7922";
});

describe("blocksToText", () => {
  it("returns empty string for an empty block array", () => {
    expect(blocksToText(blocksOf(empty))).toBe("");
  });

  it("renders a simple page with KEY_VALUE_SET fields as labelled placeholders", () => {
    const out = blocksToText(blocksOf(simpleForm));
    expect(out).toContain("## Page 1");
    expect(out).toContain("Personal Details");
    expect(out).toMatch(/Name:\s+_+/);
    expect(out).toMatch(/Date of Birth:\s+_+/);
  });

  it("renders SELECTION_ELEMENT blocks as [x] / [ ] with adjacent label text", () => {
    const out = blocksToText(blocksOf(checkboxes));
    expect(out).toContain("Marital Status:");
    expect(out).toMatch(/\[x\]\s+Single/);
    expect(out).toMatch(/\[ \]\s+Married/);
    // Consumed LINE labels must not be re-emitted as bare lines.
    expect(out.match(/Single/g)?.length).toBe(1);
    expect(out.match(/Married/g)?.length).toBe(1);
  });

  it("emits a page marker for each PAGE block", () => {
    const out = blocksToText(blocksOf(multiPage));
    expect(out).toContain("## Page 1");
    expect(out).toContain("## Page 2");
    expect(out.indexOf("## Page 1")).toBeLessThan(out.indexOf("## Page 2"));
  });

  it("renders TABLE blocks as markdown-pipe tables with a header separator", () => {
    const out = blocksToText(blocksOf(tableFixture));
    expect(out).toContain("| Name | Age |");
    expect(out).toMatch(/\|\s*-+\s*\|\s*-+\s*\|/);
    expect(out).toContain("| Alice | 30 |");
    // First data row must follow the separator
    const sep = out.indexOf("---");
    const aliceRow = out.indexOf("Alice");
    expect(sep).toBeLessThan(aliceRow);
  });
});

describe("startAnalysis", () => {
  it("returns the JobId from StartDocumentAnalysis", async () => {
    sendMock.mockResolvedValue({ JobId: "job-abc" });
    const result = await startAnalysis("uploads/abc.pdf");
    expect(result.jobId).toBe("job-abc");
  });

  it("requests FORMS and TABLES features", async () => {
    sendMock.mockResolvedValue({ JobId: "job-abc" });
    await startAnalysis("uploads/abc.pdf");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.name).toBe("Start");
    expect(cmd.args.FeatureTypes).toEqual(["FORMS", "TABLES"]);
    expect(cmd.args.DocumentLocation.S3Object.Name).toBe("uploads/abc.pdf");
  });
});

describe("getAnalysisResult", () => {
  it("returns status 'processing' when Textract is IN_PROGRESS", async () => {
    sendMock.mockResolvedValue({ JobStatus: "IN_PROGRESS" });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("processing");
  });

  it("returns status 'done' with flat blocks when SUCCEEDED", async () => {
    sendMock.mockResolvedValue({
      JobStatus: "SUCCEEDED",
      Blocks: [{ BlockType: "PAGE", Id: "p1", Page: 1 }],
    });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("done");
    if (result.status === "done") expect(result.blocks).toHaveLength(1);
  });

  it("follows NextToken pagination and concatenates blocks", async () => {
    sendMock
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "PAGE", Id: "p1", Page: 1 }],
        NextToken: "tok-1",
      })
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        Blocks: [{ BlockType: "LINE", Id: "l1", Page: 1, Text: "hello" }],
      });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("done");
    if (result.status === "done") expect(result.blocks).toHaveLength(2);
  });

  it("returns status 'failed' with reason when FAILED", async () => {
    sendMock.mockResolvedValue({
      JobStatus: "FAILED",
      StatusMessage: "Document is password-protected",
    });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("failed");
    if (result.status === "failed")
      expect(result.reason).toBe("Document is password-protected");
  });

  it("treats PARTIAL_SUCCESS as failed", async () => {
    sendMock.mockResolvedValue({ JobStatus: "PARTIAL_SUCCESS" });
    const result = await getAnalysisResult("job-1");
    expect(result.status).toBe("failed");
  });

  it("throws if Textract response is missing JobStatus", async () => {
    sendMock.mockResolvedValue({ Blocks: [], NextToken: "would-loop-forever" });
    await expect(getAnalysisResult("job-1")).rejects.toThrow(
      /missing JobStatus/i,
    );
  });
});
