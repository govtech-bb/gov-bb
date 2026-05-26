# gov-bb — Product Specification

A draft feature inventory of the **gov-bb** platform: a system of applications that lets the Government of Barbados publish, deliver, and process online forms for citizen-facing services.

> This SPEC focuses on **what the platform does** (features) rather than how it's built (libraries, file layout, build tools). Where something is ambiguous or could not be confirmed from exploration, it's called out under "Open questions" in the relevant section.

---

## 1. Platform Overview

The platform is composed of five user-facing surfaces plus shared form-domain libraries:

| Surface | Audience | Purpose |
|---|---|---|
| **Landing site** | Citizens | Discover government services and the forms behind them. |
| **Forms app** | Citizens | Fill out and submit a specific government form (multi-step). |
| **Form Builder** | Government form authors | Author and version the form definitions citizens fill in. |
| **Chat assistant** | Citizens | Get guided, conversational help finding the right form and pre-filling it. |
| **API** | All of the above | Store form definitions, accept submissions, drive downstream processors (email, payment, spreadsheet, OpenCRVS). |

All surfaces share a single **form domain model** (field types, step types, conditions, validations, processors) so that a form authored in the builder renders consistently in the forms app, can be referenced by the landing site, and can be filled with help from the chat assistant.

---

## 2. The Form Domain Model

Forms are the central artifact of the platform. A form is a JSON-described schema with the following capabilities.

### 2.1 Field types

The platform supports the following primitive field types:

- Text (single line, with optional placeholder/hint)
- Textarea (multi-line)
- Number
- Email
- Telephone
- Date (day / month / year)
- Select (single and multi)
- Radio (single choice)
- Checkbox (single and grouped multi-select)
- File upload (single or multiple, with MIME-type and size constraints)
- Show / hide toggle (disclosure widget that reveals dependent fields)

Field-level metadata includes default values, placeholder/hint text, disabled/hidden state, PII/sensitive flags, and UI width hints (short/medium/long).

### 2.2 Step types

A form is composed of an ordered list of steps. Steps can be:

- **Basic** — a container of fields with title and description.
- **Repeatable** — adds N instances of the step (min/max enforced), e.g. "add another beneficiary".
- **Conditional** — entire step shows or hides based on prior answers.
- **Review** — auto-generated "Check your answers" summary of the entire submission.
- **Declaration** — final acknowledgement step before submission.

Steps also support optional "next steps" guidance (human-readable instructions for what happens after submission).

### 2.3 Conditional logic

Field-level and step-level conditions evaluate against prior answers using the following operators:

- `equal`, `notEqual`
- `in` (membership)
- `exists`

Conditions can reference values across steps and inside repeatable-step instances.

### 2.4 Validation rules

A rich validation library is shared between client and server. Supported rule families:

- Presence: `required`, `minItems`, `maxItems`, `minSelection`, `maxSelection`
- String: `minLength`, `maxLength`, `pattern` (regex), `email`, `contains`, `strictEquality`
- Numeric: `min`, `max`, `gt`, `lt`, `equal`, `notEqual`
- Date / temporal: `past`, `pastOrToday`, `future`, `futureOrToday`, `after`, `before`, `onOrAfter`, `onOrBefore`, `minYear`, `maxYear`
- File: `fileTypes` (MIME), `itemMaxSize`, `maxSize`
- Cross-field: `conditionalOn` and `equal`/`notEqual` against another field

### 2.5 Dynamic expressions

A small expression engine (JSON Logic + Luxon for dates) lets schema authors compute values at runtime — used for things like:

- Computing a payment amount from a field
- Resolving an email recipient address from a `stepId.fieldId` path
- Date math (`age`, `today`, `daysBetween`)
- Currency formatting

### 2.6 Reusable components and blocks

To keep forms consistent, the platform ships:

- **Registry components** — ~34 prebuilt fields (e.g. full name, national ID, passport, phone, email, address fields, sex, nationality, relationship, title, bank account).
- **Reusable blocks** — multi-field groupings: `PersonalInformation`, `PhysicalAddress`, `ContactInformation`, `EmergencyContactDetails`, `SupportingDocuments`, `ProveYourIdentity`, `ApplicantDeclaration`, `AdditionalInformation`. Each block can be inserted into a form and have individual fields overridden.

Authors can also define **custom components** stored in the database that are resolved at runtime.

### 2.7 Submission processors

When a form is submitted the API runs a configurable pipeline of post-submit processors:

- **Payment (gating)** — initiates an EzPay payment flow; submission cannot complete until the payment callback is received.
- **Email** — sends a confirmation email (subject and recipient can be templated with expressions) via AWS SES.
- **Spreadsheet** — appends the submission as a row to an Excel file, keyed by submission ID.
- **OpenCRVS** — forwards the submission to an external civil-registry endpoint (with optional bearer auth and idempotency header).

Processors can be marked as "gating" (must succeed before the submission is considered complete) or fire-and-forget.

---

## 3. Forms App (Citizen-facing renderer)

The forms app is the SPA citizens use to actually fill out a form.

### 3.1 Discovery and launch
- Lists the catalogue of available forms and lets the user open one.
- Direct-linkable per form (`/forms/<formId>`).

### 3.2 Multi-step navigation
- Sequential step flow with **Continue** and **Previous** controls.
- Step order is enforced — users cannot jump ahead to a step they haven't unlocked; deep links to a locked step redirect to the first incomplete step.
- Current step is reflected in the URL (`?step=`) so refresh / back-button behave correctly.

### 3.3 Field rendering
- All field types from §2.1 are rendered with appropriate native controls.
- Show/hide toggles reveal nested fields with proper ARIA semantics.
- Radio options can inline-reveal additional fields beneath the selected option.

### 3.4 Conditional rendering
- Both field-level and step-level conditions (§2.3) are evaluated live as the user answers.

### 3.5 Repeatables
- **Repeatable steps**: a step can be cloned into multiple instances (e.g. multiple dependents); a max-instance limit is enforced.
- **Repeatable field arrays within a step**: e.g. "add another middle name" with add/remove buttons; min/max counts honored.

### 3.6 Validation
- Client-side validation runs on step-advance using the shared rule library (§2.4).
- Error summary at the top of the step plus inline messages on individual fields.

### 3.7 Draft persistence (in-progress)
- Form progress is saved to **browser session storage** as the user types, so accidental refreshes don't lose data.
- Session storage clears when the tab closes — long-term resume across sessions is not currently supported in this surface alone. (See §6 for the API's draft endpoints.)

### 3.8 Review and declaration
- A "Check your answers" review step summarises all entered values, formatted for humans (radio labels rather than codes, formatted dates, etc.).
- Each line links back to its source step for editing ("Change").
- A final declaration step gates submission.

### 3.9 Submission and confirmation
- On submit the user sees a confirmation page with: service name, reference number, submission date, contextual next-steps guidance, support contact info, and an optional feedback survey prompt.
- If the form has a payment processor and the API returns `pending_payment`, the confirmation page shows a payment summary and redirects the user to the EzPay gateway. After payment, a payment success screen is shown.

### 3.10 Analytics
- A fixed, low-cardinality event taxonomy is sent to Umami: form open, step view, step advance/back, field validation error, submit, submit success, submit error, file select.
- **Privacy-by-design**: never captures field values, field labels, free-text input, or filenames. Only stable IDs, MIME types, file sizes in KB, and reason categories.

### 3.11 Branding and accessibility
- Government of Barbados banner, Coat of Arms, Figtree typography, Home / Terms & Conditions footer.
- Semantic HTML (fieldset/legend, labels), ARIA attributes for disclosure widgets, keyboard-navigable controls, responsive mobile layout.

### Open questions (Forms app)
- Whether a signature-capture field is supported — no dedicated signature control was found.
- Whether the forms app itself supports resume-after-browser-close, or whether that requires going through the API's draft endpoints (§6.2).
- Whether multilingual rendering is in scope — there are hints in the code about "localized versions" but no language selector exists today.

---

## 4. Landing Site

The landing site is the public front door for citizens looking for a government service.

### 4.1 Service catalogue
- Browseable list of ~20+ services (benefits, documents, business, travel, …) with title, short description, and category.
- Each service has a content-driven page describing eligibility, steps, fees, opening hours, and contact information.

### 4.2 Search
- Client-side full-text search across service titles, descriptions, and headings.

### 4.3 Government organisations
- Browseable index of ministries / departments with their associated services grouped beneath them.

### 4.4 "Start now" → forms app
- A service page whose frontmatter declares a `form_id` automatically renders a **Start now** call-to-action that deep-links into the forms app at `/forms/<form_id>`.
- The set of "live" form IDs is fetched from the API at build time so links never point at a form the API doesn't actually serve; the build fails if the API is unreachable.

### 4.5 Supporting content
- Hero / featured search on the home page.
- Bank holiday calendar.
- Feedback form (citizen feedback collection).

### 4.6 Analytics
- Umami pageviews and curated events (service clicks, search queries, "Start now" CTA clicks tagged with form ID), gated by an env var so dev traffic doesn't pollute the dataset.

### Open questions (Landing)
- Destination of feedback-form submissions (which API/inbox they land in).
- Whether every service page is markdown-driven or some are bespoke route files.

---

## 5. Form Builder (Authoring tool)

The form builder is the tool government form authors use to create the JSON schemas that drive the forms app.

### 5.1 Two authoring paths
- **UI Builder** — visual drag-and-drop composer for assembling steps and fields.
- **AI Builder** — upload a PDF or supply a prompt and have Claude generate a draft form structure that the author then refines.

### 5.2 Visual composition
- Drag fields into steps; configure label, placeholder/hint, required state, min/max constraints, default value.
- Compose multi-step layouts.

### 5.3 Validation authoring
- Add validation rules from the shared rule library (§2.4) per field, including regex patterns and cross-field rules.

### 5.4 Conditional logic authoring
- Configure field- and step-level show/hide conditions referencing other fields by name.

### 5.5 Versioning
- Form schemas are versioned (1.0.0, 1.1.0, …); the builder tracks the published version separately from the in-progress draft.

### 5.6 Preview
- Authors can render the form as a citizen would see it before publishing.

### 5.7 Publish
- The full schema is validated before submission; on submit it's persisted to the registry so the API can serve it and the forms app can render it.

### Open questions (Form Builder)
- The publish/unpublish workflow is reported to be in flux ("being removed") — current intended behaviour needs confirmation.
- The AI builder's exact UX (chat? one-shot? iteration loop?) was not fully explored.
- Whether the builder also lets authors configure processors (payment amounts, email recipients, OpenCRVS routes), or whether those are still configured outside the UI.

---

## 6. API

The API is the backend of record. It serves form definitions, persists submissions and drafts, and orchestrates the post-submit processor pipeline.

### 6.1 Form definitions
- List available forms (id, title).
- Fetch the full form contract for a given `formId`, optionally pinned to a version.
- Resolves custom-component references at request time (with a short cache).

### 6.2 Drafts
- Create a draft submission and resume it later via `draftId`.
- Drafts capture the last-active step so the citizen can resume where they left off.
- Drafts can be explicitly abandoned.

### 6.3 Submissions
- Accept a finalized submission with the citizen's answers.
- Statuses tracked: `DRAFT → SUBMITTED | PENDING_PAYMENT → PROCESSING → COMPLETE | ERROR`.
- Duplicate protection via a required idempotency key (with pessimistic locking).
- Server-side step-scoped validation (re-runs the same validation library the client uses, but only against visible/active fields).
- Server-side condition evaluation, so hidden fields are not validated or stored.
- Repeatable-step array handling with min/max enforcement.
- Audit metadata: visited pages, active/hidden field IDs, draft session info, timestamps.

### 6.4 Processor pipeline
- Runs the processors described in §2.7 against each submission, in configured order.
- Payment is *gating*: submission stays in `PENDING_PAYMENT` until the EzPay webhook confirms outcome.
- Email, Spreadsheet, and OpenCRVS run post-submit; failures are logged but (today) don't fail the submission.

### 6.5 Payment integration (EzPay)
- Initiates payment with department-specific keys, customer identifiers, and supported payment methods (credit / debit / PAYCE toggles).
- Persists `Payment` and `PaymentTransaction` records.
- Webhook endpoint accepts EzPay callbacks with optional HMAC signature verification.
- Status tracking covers: Pending, Initiated, Success, Failed, Cancelled, Mismatched, Refunded.
- Background reconciliation matches callbacks to submissions; abandoned payments are cleaned up after a TTL.

### 6.6 Security & abuse protection
- Bearer-token (JWT) authentication on form definitions, drafts, and submissions endpoints.
- Per-endpoint rate limiting with progressively tighter buckets for submission endpoints (e.g. 3/10s, 10/min, 50/hr).
- Helmet security headers; CORS configurable per environment.
- The payment webhook bypasses throttling and uses HMAC verification instead.

### Open questions (API)
- The exact JWT validation strategy (controllers declare `@ApiBearerAuth()` but the guard wiring was not located — may live in middleware, a gateway, or an external proxy).
- Where uploaded files are physically stored. The `upload-document` field exists, but no file-storage endpoint was found in the API — file handling may happen client-side, via a separate service, or directly against a storage bucket.
- Whether non-gating processor failures are surfaced to operators (DLQ / alerting), or only to logs.

---

## 7. Chat Assistant

A conversational, retrieval-augmented helper for citizens who don't know which form they need or how to fill it.

### 7.1 Retrieval-augmented answers
- Knowledge base of form instructions, service guides, and government docs, ingested as markdown / PDF, chunked and embedded into a `pgvector` store.
- Each answer is grounded in retrieved chunks above a similarity threshold; sources surface author, section title, snippet, and original URL.

### 7.2 Guided form discovery
- Through dialogue, the assistant narrows down which government service the citizen needs.
- The assistant can render a **multiple-choice UI** mid-conversation (`present_choices`) to disambiguate (e.g. "Which certificate type?").

### 7.3 Form pre-fill handoff
- Once the relevant form is identified and the required fields have been collected, the assistant calls `open_form_review`, which pre-fills the form and redirects the citizen to the forms app at `/forms/<form_id>` for final review and submission.
- Field values are validated for format before handoff.

### 7.4 Conversation context
- Stores prior messages so follow-ups can be interpreted in context (e.g. "what documents?" inherits the service from the previous turn).
- Markdown answer rendering (lists, bold, spacing) is enforced by the system prompt.

### 7.5 Ingestion tooling
- Backend CLI ingests new markdown and PDFs into the vector store.

### Open questions (Chat)
- The exact list of forms the chat assistant currently knows how to pre-fill (vs. just describe).
- Whether the assistant ever submits on the citizen's behalf, or whether handoff to the forms app is always required (today it appears to always hand off).
- Whether chat conversations are retained per-user across sessions and how that ties (if at all) to identity / auth.

---

## 8. Cross-Surface Behaviours

- **Landing → Forms**: service pages with a `form_id` render a "Start now" CTA that deep-links into the forms app; the available-forms manifest is fetched from the API at build time.
- **Chat → Forms**: the assistant collects answers conversationally and then hands off to the forms app with answers pre-filled.
- **Builder → API → Forms**: forms authored in the builder are persisted via the API and immediately become available to the forms app catalogue.
- **API ↔ EzPay**: outbound initiation + inbound webhook callback; status reconciliation in the background.
- **All surfaces → Umami**: the forms app and the landing site emit a small, privacy-respecting analytics taxonomy; analytics is env-var-gated so dev traffic stays out of production datasets.

---

## 9. Known Gaps / Things to Confirm With the Team

Collected from the "Open questions" callouts above plus general signals during exploration:

1. **Authentication for citizens** — Is there a citizen identity layer (login, ID-Bajan, etc.) anywhere in the flow, or are forms intentionally anonymous + reference-number based?
2. **File storage** — Where do uploaded documents actually live, and how long are they retained?
3. **Resume across sessions** — Forms-app draft today is session storage; the API has draft endpoints. Is the intended product behaviour "anonymous, single-session" or "resumable from a link / account"?
4. **Multilingual** — Is multi-language rendering on the roadmap? Code hints exist but no UI does.
5. **Signature capture** — Is wet-signature / e-signature required for any form? Not seen as a field type today.
6. **Form builder publish workflow** — In flux per the form_builder docs; what is the intended end state?
7. **Processor failure handling** — For non-gating processors (email/spreadsheet/OpenCRVS), what's the intended retry/alert behaviour?
8. **Chat ↔ identity** — Are chat conversations tied to a citizen identity in any way, or fully ephemeral?
9. **Test coverage for end-to-end flows** — The forms app has Playwright tests; equivalent end-to-end coverage for chat handoff and builder publish was not verified.
