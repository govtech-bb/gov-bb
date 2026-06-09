import type { Block } from "@aws-sdk/client-textract";
import { blocksToText } from "./textract";
import simpleForm from "./__fixtures__/textract/simple-form.json";
import checkboxes from "./__fixtures__/textract/checkboxes.json";
import multiPage from "./__fixtures__/textract/multi-page.json";
import empty from "./__fixtures__/textract/empty.json";

const blocksOf = (f: { Blocks: unknown[] }) => f.Blocks as Block[];

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
});
