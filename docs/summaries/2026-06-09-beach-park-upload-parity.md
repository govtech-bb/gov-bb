# Beach/Park vendor licence — staging parity fixes (#1017)

## Context

The staging "Apply to sell goods or services at a beach or park" form drifted
from live on three points
([#1017](https://github.com/govtech-bb/gov-bb/issues/1017)):

1. Both upload fields showed "No file type restrictions / Max Size: --" instead
   of ".pdf, .docx, or .png — Maximum size: 25MB".
2. `passport-photos` rendered as a single-file input despite the recipe setting
   `"multiple": true`.
3. The National ID field showed the component default "National ID number"
   instead of live's "National Identification (ID) Number".

Resolved on `fix-beach-park-upload-parity-1017` (targets `sandbox`).

## What we did

- **New recipe `sell-goods-services-beach-park/1.5.0.json`** (copied from 1.4.0):
  - Added `fileTypes` (`[".pdf", ".docx", ".png"]`) and `maxSize` (`26214400`)
    validations to both `police-certificate` and `passport-photos`, copying the
    exact shape from `apply-for-conductor-licence` 1.5.0.
  - Added `"label": "National Identification (ID) Number"` to `applicant-nid`,
    plus `ui.width: "medium"` — matching the conductor recipe's NID field.
  - Bumped `version` to `1.5.0`; the recipe loader auto-activates the highest
    semver, so no index/pointer edit was needed.
- **Renderer fix** in `apps/forms/src/components/file-upload.tsx`: forward
  `field.multiple` onto the file `<input>` (`multiple={field.multiple ?? false}`).
  Added three spec cases in `file-upload.spec.tsx`.

## Why we did it that way

- **#1 and #3 are recipe data; #2 was a renderer bug.** The FileUpload
  component derives its subtitle, the "Max Size" line, the native `accept`
  filter, and the client-side oversize short-circuit **purely from
  `field.validations.fileTypes` / `field.validations.maxSize`** — not from the
  `hint` text. So the hint already said "Upload a PDF, DOCX, or PNG file (max
  25MB)", but with no validations the UI fell back to "No file type
  restrictions". Adding the validations was the whole fix for #1.
- For #2 the recipe was already correct (`"multiple": true`). The renderer
  never wired `field.multiple` to the DOM: `sharedProps` omits it and the
  `case "file"` branch didn't add it — unlike `case "select"` which does
  `multiple={isMultiple}`. One line on the `<input>` fixes it for every upload
  field, not just this form.
- **Kept the existing `hint` wording.** Now that the constraint display comes
  from the validations, the hint is cosmetic; rewording it would only enlarge
  the diff.

## Out of scope / follow-up

- **F-14 (server-side per-field enforcement).** The API presign path enforces
  only a global `UPLOAD_MAX_SIZE_BYTES` (default 10MB) and validates
  `contentType` as *a* MIME type — it does not check the recipe's per-field
  `fileTypes`/`maxSize`. Left as a separate follow-up (issue not yet filed).
