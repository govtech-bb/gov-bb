# Forms API Endpoints

This document describes the HTTP endpoints the forms platform's provider API
(`apps/api`) exposes to a client (`apps/forms`), covering the request bodies for
`POST` endpoints and the shape of the data each returns.

It is a companion to [Understanding Service Contracts](./Service%20Contracts.md):
the service contract describes *what* a form looks like, while this document
describes the endpoints used to *fetch* a form definition and *submit* answers
and files against it.

## The response envelope

Every `apps/api` endpoint wraps its payload in a single, uniform envelope. This
is single-sourced in
[`packages/form-types/src/api-response.type.ts`](../../packages/form-types/src/api-response.type.ts)
so the producer (`apps/api`) and the browser consumer (`apps/forms`) share one
definition of the wire contract.

```ts
interface ApiResponseShape<T> {
  status: "success" | "failed";
  message: string;
  data: T;
  statusCode: number;
  meta?: Record<string, unknown>;
}
```

Where:

- **status**: Whether the request succeeded. `apps/forms` widens this on its own
  side to also carry the submission-status union (see `POST /submissions`).
- **message**: A human-readable description of the outcome.
- **data**: The endpoint-specific payload — the shapes documented below are
  always this `data` field.
- **statusCode**: The HTTP status. `apps/forms` treats it as optional to
  tolerate an older API deploy that omits it.
- **meta**: Optional. Used to carry side-channel information such as a deferred
  payment redirect (see `POST /submissions`).

On the client side, both `apps/forms/src/lib/api/forms.ts` and
`apps/forms/src/lib/api/files.ts` unwrap this envelope and return only the inner
`data` to callers.

## `GET /form-definitions`

Returns the public index of published forms. There is no `POST` on this route.

**Response** — `data` is an array of `PublicFormSummary`
([`packages/form-types/src/form-summary.type.ts`](../../packages/form-types/src/form-summary.type.ts)):

```ts
interface PublicFormSummary {
  formId: string;
  title: string;
  version: string;
  category?: string;                 // owning ministry/department, from contactDetails.title
  visibility?: RecipeVisibility;     // present only on the authoring list
  closingDateTime?: string;          // ISO-8601; present when meta.closingDateTime is set
}
```

Supplying a valid `X-Recipe-Preview` header turns this into the *authoring* list:
non-public forms are included and each entry carries its `visibility`. With no
token the response is the public-only index and `visibility` is omitted.

Two sibling routes return advisory `formId` lists (`data` is `string[]`):

- `GET /form-definitions/maintenance` — forms currently under maintenance.
- `GET /form-definitions/closed` — forms whose submission deadline has passed.

## `GET /form-definitions/:formId`

Returns a single form's full recipe.

**Response** — `data` is a `ServiceContract` (see
[Understanding Service Contracts](./Service%20Contracts.md)).

Optional headers alter which recipe is served:

- `X-Recipe-Preview` — visibility bypass; serves the published recipe of a
  non-public form.
- `X-Recipe-Draft` — sources the in-progress builder draft from the database.

A disabled (tombstoned) form returns **410 Gone** with the body
`{ disabled: true, reason }` rather than the envelope above.

## `POST /submissions`

Submits a completed set of form answers.

**Required header:** `idempotency-key`. **Optional header:** `X-Recipe-Preview`
(lets a reviewer submit a published-but-non-public form).

**Request body** (`CreateSubmissionDto`):

```ts
{
  formId: string;              // required
  formVersion?: string;        // optional, deprecated (#1196); semver string if sent
  draftId?: string;            // optional
  values: SubmissionValues;    // required
}
```

Where `values` is an object keyed by `stepId`. Each step's value is an object of
`fieldId → value`, or an array of such objects for repeatable steps:

```ts
{
  personalDetails: { firstName: "Jane", surname: "Doe" },
  previousJobs: [{ employer: "ACME" }, { employer: "Globex" }]
}
```

The `apps/forms` client sends only `{ formId, values }` in the body; the
idempotency key travels in the header.

**Response** — `data` is the persisted submission, documented by
`FormSubmissionResponseDto`:

```ts
{
  id: string;                        // auto-generated UUID
  idempotencyKey: string;
  referenceCode: string;             // human-readable, e.g. "PR-20260515-104530-A3B7K9"
  formId: string;
  formVersion: string | null;        // null for versionless submissions (#1196)
  status: FormSubmissionStatus;      // draft | submitted | pending_payment | processing | complete | error
  values: Record<string, unknown>;   // server's echo of the submitted answers
  meta: Record<string, unknown> | null;
  submittedAt: string | null;        // ISO-8601; null for pending-payment forms
  createdAt: string;                 // ISO-8601
  updatedAt: string;                 // ISO-8601
}
```

For payment ("gated") forms, `status` is `pending_payment`, `submittedAt` is
`null`, and the envelope's **`meta`** carries the payment redirect:

```ts
meta: {
  deferred: {
    paymentUrl: string;
    paymentId: string;
    amount: number;
    description: string;
  }
}
```

## The file upload flow

Attaching a file to a submission is a three-step flow: presign a URL, upload the
file directly to storage, then confirm the upload. The two `POST` endpoints
below are the first and third steps; the middle step is a `PUT` straight to the
presigned storage URL (its `Content-Type` must match the `contentType` sent at
presign time).

Both endpoints accept optional `X-Recipe-Preview` and `X-Recipe-Draft` headers so
a file field's config resolves against the same recipe the form was loaded from.
These tokens are **always headers, never body fields** — the API runs
`forbidNonWhitelisted`, so any unknown body key is rejected.

### `POST /files/presign-upload`

Requests a presigned URL to upload a single file to.

**Request body** (`PresignUploadDto`):

```ts
{
  formId: string;        // matches /^[a-z0-9-]+$/i, max 100 chars
  formVersion?: string;  // optional, deprecated, max 20 chars
  stepId: string;        // slug /^[a-z0-9-]+$/i, max 100 chars
  fieldId: string;       // /^[A-Za-z0-9_-]+$/, max 100 chars (path-safe; embedded in the storage key)
  fileName: string;      // max 255 chars
  contentType: string;   // a valid MIME type
  size: number;          // integer, >= 1 (bytes)
}
```

**Response** — `data` is a `PresignUploadResponseDto`:

```ts
{
  uploadUrl: string;   // presigned storage PUT URL
  key: string;         // the storage object key
  expiresIn: number;   // seconds until the URL expires
  maxSize: number;     // max allowed file size in bytes
}
```

### `POST /files/confirm-upload`

Confirms an uploaded file, verifying the stored blob against the form's policy.

**Request body** (`ConfirmUploadDto`):

```ts
{
  key: string;           // the storage key from the presign step, max 512 chars
  formId: string;
  formVersion?: string;  // optional, deprecated
  stepId: string;
  fieldId: string;
}
```

**Response** — `data` is a `FileAttachmentDto`:

```ts
{
  key: string;
  url: string;
  name: string;
  size: number;
  type: string;
}
```

The `apps/forms` client types this return value as `UploadedFile`, which is the
same shape but with an optional `url`. This confirmed reference is what gets
stored in form state and included in the submission `values`.
