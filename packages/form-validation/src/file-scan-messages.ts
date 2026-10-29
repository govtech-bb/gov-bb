// What a person is told about an uploaded file that isn't clean. The forms
// upload page shows these as soon as the scan verdict arrives, and the API
// refuses the submission with the same text, so the two always match (#2940).
export const INFECTED_FILE_MESSAGE =
  "This file is unsafe. Remove it and upload another file.";
export const UNSCANNABLE_FILE_MESSAGE =
  "We could not check this file. Remove it and try again, or upload another file.";
