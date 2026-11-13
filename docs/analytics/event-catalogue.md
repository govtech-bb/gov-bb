# Analytics event catalogue

Every analytics event the landing, forms and chat apps send: its name, its
data, where it fires, and what Umami and `/journey` receive. Use it to build a
dashboard in Umami or Datadog without reading the code.

Two tests keep it complete: `apps/landing/src/lib/event-catalogue.test.ts`
fails when a `TrackingData` key has no row here, and
`apps/landing/src/lib/click-event-names.test.ts` fails when a
`data-umami-event` value has no row here. When you add an event, add its row.

## Where events go

Every event and page view goes through `trackEvent` or `trackPageview` in
`@govtech-bb/analytics`, so each one reaches **both** destinations, when each
is switched on for the environment:

- **Umami Cloud**, when the app has `VITE_UMAMI_WEBSITE_ID`.
- **`/journey`** (the API's `POST /journey`, logged to Datadog), when the app
  has `VITE_JOURNEY_URL`.

No event goes to only one of them. What differs is the shape each one stores:

|            | Umami                                                                        | `/journey`                                                                               |
| ---------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Event name | `<form>:<event>` when the data has a `form` (see below), else the event name | The event name. The form is in the `form` prop.                                          |
| Page       | The path, never the query string                                             | The path, never the query string                                                         |
| Journey ID | Never sent                                                                   | `journey_id`, one per browser tab, joined across landing, forms and the EzPay round trip |
| Page view  | A Umami page view                                                            | An event named `pageview`                                                                |

**Packed names in Umami.** When the event data has a `form`, Umami stores the
name as `<form>:<event>`, for example
`get-birth-certificate:form-step-view`. Umami cuts names off at 50 characters,
so a name that would run longer uses a short code for the event (such as
`fconf` for `form-confirmation-view`, and `s3` for step three) and, for a form
ID over 44 characters, a hashed form key. `eventName()`, `canonicalEvent()` and
`stepFromEvent()` in `@govtech-bb/analytics` convert between the two; the
short codes are in `SHORT_EVENT`. `/journey` always gets the full event name.

**Search text is masked.** Any `query` value goes through `maskSearchQuery`
before it is sent. Email addresses and numbers of 6 or more digits (phone, NIS
and ID numbers) keep only their first and last character: `123456` is sent as
`1****6`. Other words are sent as typed.

**Data keys.** Event names are fixed strings ([ADR 0010](../decisions/0010-analytics-events-use-fixed-names-and-structured-data.md)).
The varying part (the form, step, tool or service) goes in the data.

## Page views

| Event      | Data | Fires when                                                                                                                 | Apps                 |
| ---------- | ---- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `pageview` | none | The router renders a new path. In forms, a change to `?step=` alone is not a page view: steps are `form-step-view` events. | landing, forms, chat |

## Forms journey

Sent by the forms app, except `page-service-view` and `page-start-view`, which
landing sends. Every event here has a `form` (the form ID) and a `category`
(the form's first category), so Umami stores it as `<form>:<event>`.

| Event                    | Data                                                    | Fires when                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page-service-view`      | `form`, `category`                                      | Landing: a service page with a `form_id` is viewed.                                                                                                                                                                                                       |
| `page-start-view`        | `form`, `category`                                      | Landing: the `/start` page of a service with a `form_id` is viewed.                                                                                                                                                                                       |
| `form-start`             | `form`, `category`                                      | The form opens.                                                                                                                                                                                                                                           |
| `form-step-view`         | `form`, `category`, `step`                              | A step is shown. `step` is the step ID.                                                                                                                                                                                                                   |
| `form-step-<n>`          | `form`, `category`, `step`                              | The citizen continues past step _n_ to another step. _n_ is a word up to ten (`form-step-three`), then a number (`form-step-11`). `step` is the ID of the step completed. Built at runtime by `stepCompleteEventName`, so it is not a `TrackingData` key. |
| `form-step-back`         | `form`, `category`, `step`                              | The citizen goes back a step.                                                                                                                                                                                                                             |
| `form-step-edit`         | `form`, `category`, `step`                              | The citizen selects Change on check your answers. `step` is the step they go back to.                                                                                                                                                                     |
| `form-validation-error`  | `form`, `category`, `step`, `errorCount`, `fieldErrors` | The citizen tries to continue with errors. `fieldErrors` is `field:code[\|code];field:code…`: each field ID with the reason codes it failed on.                                                                                                           |
| `form-file-select`       | `form`, `category`, `step`, `field`, `mime`, `size_kb`  | The citizen picks a file. Never the file name.                                                                                                                                                                                                            |
| `form-file-error`        | `form`, `category`, `step`, `field`, `reason`           | A picked file is not added. `reason` is `rejected` (refused for its type or size), `error`, `timeout`, `infected` or `unscannable`.                                                                                                                       |
| `form-file-remove`       | `form`, `category`, `step`, `field`                     | The citizen removes a file.                                                                                                                                                                                                                               |
| `form-review`            | `form`, `category`, `duration_seconds`                  | The citizen leaves check your answers. `duration_seconds` is the time spent there.                                                                                                                                                                        |
| `form-submit`            | `form`, `category`, `duration_seconds`                  | The submission is accepted. `duration_seconds` is the time since `form-start`.                                                                                                                                                                            |
| `form-submit-error`      | `form`, `category`, `errors`                            | The submission fails. `errors` is `validation`, `network`, or the reason the API gave.                                                                                                                                                                    |
| `payment-initiated`      | `form`, `category`, `amount`                            | The citizen selects Continue to payment on the confirmation page.                                                                                                                                                                                         |
| `payment-returned`       | `form`, `category`, `outcome`                           | The citizen comes back from EzPay. `outcome` is `success` or `failed`.                                                                                                                                                                                    |
| `form-confirmation-view` | `form`, `category`, `outcome`, `hasPayment`             | The confirmation page is shown, once per visit to it: the end of the journey. `outcome` is the submission or payment state.                                                                                                                               |
| `form-print`             | `form`, `category`                                      | The citizen selects Print on the confirmation page.                                                                                                                                                                                                       |

## Dead ends

Where a citizen was stopped before reaching a service.

| Event                      | Data                                                 | Fires when                                                                                                              | App     |
| -------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| `form-closed-view`         | `form`                                               | The form is closed to applications.                                                                                     | forms   |
| `form-load-error`          | `form` (absent when the form is not found), `reason` | The form cannot load. `reason` is `not-found`, `network` or `server`. Umami packs the name only when `form` is present. | forms   |
| `service-unavailable-view` | none                                                 | The service unavailable page is shown.                                                                                  | landing |
| `page-not-found`           | `app`                                                | A page is not found. Never the path, which can hold typed text.                                                         | landing |

## Search

On landing. Every `query` is masked (see above).

| Event                      | Data                                           | Fires when                                                                           |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `search-submit`            | `query`, `source`                              | A search is submitted. `source` is the search box: `home`, `services` or `results`.  |
| `search-suggestion-select` | `query`, `title`, `href`, `position`, `source` | The citizen picks a suggestion under the search box. `query` is what they had typed. |
| `search`                   | `query`, `results`                             | The search results page loads. `results` is the number of results.                   |
| `search-no-results`        | `query`                                        | The search results page has no results.                                              |
| `search-result-click`      | `query`, `position`, `href`                    | The citizen selects a search result. `position` starts at 1.                         |

## Interactive tools

On landing. Every tool sends the same four events, with the tool in the data
([ADR 0138](../decisions/0138-landing-tools-send-shared-fixed-name-events.md)).
`tool` is one of `pharmacy-finder`, `shelter-finder`, `water-outages`,
`crop-over-permits`, `severance-calculator`, `nis-self-employed`,
`pension-calculator` and `bank-holidays`. Steps, outcomes, actions and errors
are short codes set in each tool's code. No tool sends an amount, an email
address, coordinates, a distance or text typed into it.

| Event            | Data                                                                | Fires when                                                                      |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `tool-step-view` | `tool`, `step`                                                      | A step or question of a tool is shown.                                          |
| `tool-result`    | `tool`, `outcome`, `results` (optional), and that tool's data below | A tool settles on a result, such as a search, an estimate or a sign-up.         |
| `tool-action`    | `tool`, `action`, `target` (optional), `step` (optional)            | A link or button in a tool is used. `target` is an ID set in code, never a URL. |
| `tool-error`     | `tool`, `error`, `step` (optional)                                  | A tool cannot do what was asked, such as when location is refused.              |

The extra `tool-result` data each tool can send (`ToolResultData` in
`packages/analytics/src/tool-events.ts`). A list is a comma-separated string of
codes.

| Tool                   | Extra `tool-result` data                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `pharmacy-finder`      | `parishes`, `type`, `slip`, `subsidised_only`, `open_now`, `has_query`, `used_location` |
| `shelter-finder`       | `parishes`, `categories`, `amenities`, `sort`, `has_query`, `used_location`             |
| `water-outages`        | `step`, `parish`, `chosen_by`, `active_notices`, `past_notices`                         |
| `crop-over-permits`    | `event`, `venue`, `permits`                                                             |
| `severance-calculator` | `reason`                                                                                |
| `nis-self-employed`    | `plan`                                                                                  |
| `pension-calculator`   | none                                                                                    |
| `bank-holidays`        | none                                                                                    |

## Chat

Never the question or answer text.

| Event             | Data                         | Fires when                                                                                                                                                                                                  | App           |
| ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `chat-submit`     | `source`                     | A question is asked. `source` is where: a landing placement such as `home`, or `chat` when typed in the chat app.                                                                                           | landing, chat |
| `chat-suggestion` | `question`, `source`         | The citizen picks one of the suggested questions on landing. `question` is the suggestion, which is set in code.                                                                                            | landing       |
| `chat-answer`     | `outcome`, `source`, `cited` | The chat app's reply to one question ends. `outcome` is `answered`, `error` or `stopped`. `source` is `chat` or `landing` (carried over in `?q=`). `cited` is true when the reply cites alpha.gov.bb pages. | chat          |

## Links and buttons on landing

### Links that leave the service

| Event            | Data                                    | Fires when                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outbound-click` | `kind`, `host` (web links only), `page` | The citizen follows a link to another site, a `tel:` link or a `mailto:` link. `kind` is `link`, `tel` or `mailto`; `page` is the current path. Never the full URL, number or address. Links to the forms app are not outbound. |

### Clicks tagged with `data-umami-event`

An element tagged `data-umami-event="<name>"` sends that event when it is
clicked, with each `data-umami-event-<key>` attribute as data. Keys arrive in
camelCase (`data-umami-event-form-id` becomes `formId`) and every value is a
string. Umami's own handler for these attributes is off (`data-auto-track` is
`false`): `installClickListener` in `@govtech-bb/analytics` sends each click
through `trackEvent` instead.

| Event                    | Data             | Fires when                                                                                              |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------- |
| `start-click`            | `formId`, `from` | The citizen selects Start now on a service page. `formId` is the form started; `from` is the page path. |
| `service-click`          | `slug`, `title`  | The citizen selects a service on `/services`.                                                           |
| `breadcrumb`             | `to`, `depth`    | The citizen selects a breadcrumb link.                                                                  |
| `helpful-feedback`       | `path`           | The citizen selects "Help us improve alpha.gov.bb" in the "Was this helpful?" box on a content page.    |
| `bank-holiday-year-prev` | `year`           | The citizen moves to the previous year on `/bank-holiday-calendar`.                                     |
| `bank-holiday-year-next` | `year`           | The citizen moves to the next year on `/bank-holiday-calendar`.                                         |

### Other landing links and forms

| Event                    | Data     | Fires when                                                              |
| ------------------------ | -------- | ----------------------------------------------------------------------- |
| `featured-assistant`     | none     | The citizen selects the chat assistant in the homepage's featured list. |
| `featured-tracker`       | none     | The citizen selects the tracker in the homepage's featured list.        |
| `featured-bank-holidays` | none     | The citizen selects bank holidays in the homepage's featured list.      |
| `footer-home`            | none     | The citizen selects Home in the footer.                                 |
| `footer-terms`           | none     | The citizen selects the terms link in the footer.                       |
| `footer-careers`         | none     | The citizen selects the careers link in the footer.                     |
| `feedback-submit`        | none     | The citizen submits the `/feedback` form.                               |
| `feedback-success`       | none     | The `/feedback` form is accepted.                                       |
| `feedback-error`         | `reason` | The `/feedback` form fails. `reason` is `validation` or `server`.       |
| `tell-us-submit`         | none     | The Tally form on `/tell-us` is submitted.                              |

The featured assistant and tracker links and the footer careers link go to
other sites, so each of those clicks also sends `outbound-click`. So do the
homepage's "Try asking" questions, which go to the chat app and also send
`chat-suggestion`.
