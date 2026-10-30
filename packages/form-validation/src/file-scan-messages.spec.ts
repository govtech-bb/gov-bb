import {
  INFECTED_FILE_MESSAGE,
  UNSCANNABLE_FILE_MESSAGE,
} from "./file-scan-messages";

// Content design approved this wording on #2940. The upload page and the API's
// submit refusal both read these constants, so a change here changes both.
describe("file scan messages", () => {
  it("tells the person an unsafe file must be replaced", () => {
    expect(INFECTED_FILE_MESSAGE).toBe(
      "This file is unsafe. Remove it and upload another file.",
    );
  });

  it("tells the person a file we could not check can be retried or replaced", () => {
    expect(UNSCANNABLE_FILE_MESSAGE).toBe(
      "We could not check this file. Remove it and try again, or upload another file.",
    );
  });
});
