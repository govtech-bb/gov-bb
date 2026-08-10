# Request an Environmental Health Officer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `environmental-health-officer-request` prototype into a new form recipe plus a landing content page, cross-linked from the temporary restaurant licence service.

**Architecture:** Recipe-driven, data only. A single JSON recipe under `apps/api/src/forms/form-definitions/recipes/` is validated against `serviceContractRecipeSchema`, hydrated by the API's registry resolver, and rendered by `apps/forms` via existing `htmlType`s. A markdown content page under `apps/landing/src/content/` carries the guidance and the Start button. No application code is written in any task.

**Tech Stack:** JSON recipes + `@govtech-bb/form-types` (Zod) + `@govtech-bb/registry`; Vitest 4 for unit gates; `tsx` scripts for the recipe and services-index gates; Playwright for the on-demand live smoke.

**Design spec:** [2026-08-10-environmental-health-officer-request-design.md](../specs/2026-08-10-environmental-health-officer-request-design.md). Read it before Task 1 — it records why each departure from a literal port exists.

## Global Constraints

- **pnpm only.** Never `npm`. All commands run from the repo root.
- **`formId` must equal the recipe filename**, without `.json`. Enforced by `recipe-invariants.spec.ts` and `pnpm validate-recipes`.
- **The formId is `request-an-environmental-health-officer`** everywhere: recipe filename, recipe `formId`, landing directory name, and the page's `form_id` frontmatter. Reference codes derive from segment initials automatically (`RAEHO-…`); do **not** set an explicit `prefix`.
- **Every `fieldId` and `stepId` is kebab-case.** Enforced by `kebabIdSchema`.
- **`fieldId`s must be unique within a step.** Enforced by `recipe-invariants.spec.ts`.
- **Every `ref` must exist in `BUILTIN_REGISTRY`.** Enforced by `pnpm validate-recipes` and the invariants spec.
- **Optional fields must set `validations.required.value: false` explicitly.** Generic primitives default to `required: true`; a top-level `required` key is dead. Omitting this makes an "(optional)" field mandatory.
- **The webhook processor carries `mapping` only.** Never `endpoint`, `auth` or `url` — destinations resolve per-MDA from the `MDA_WEBHOOK_DESTINATIONS` secret. Enforced by `scripts/webhook-recipe-guards.ts`. `mapping.programmeCode` must be non-empty, and every `mapping.applicant` path and `excludeSteps` entry must name a step that exists in this recipe.
- **`meta.visibility` is `"draft"`** and the content page's `visibility` is `preview`. Do not set either to `public` in this work.
- **Never put a query parameter on a `data-start-link`.** Hardcoding `?preview=…` leaks `PREVIEW_SECRET` into the client bundle and fails the Amplify build. The anchor stays bare.
- **Branch names must not contain a `.`** — a local PreToolUse hook and CI both block it. Work happens on `eho-request-recipe`.
- **Do not modify** `apps/forms/src`, `packages/registry`, `packages/form-types`, or the licence recipe. Tasks 7–8 add a **new** file under `apps/forms/e2e/smoke/` — that is the only permitted `apps/forms` change, and it adds a test rather than touching the renderer. The design requires zero renderer, registry and type changes; if a task appears to need one, stop and report rather than making it.
- **Only one existing file is edited by this plan:** `apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md`, in Task 6. `apps/api/src/content/services-index.generated.ts` also changes, but only ever by running its generator — never by hand.
- **The working tree already carries an unrelated modification** to `apps/forms/src/routeTree.gen.ts` (a generated file, 41 insertions / 41 deletions) that predates this work. Never stage or commit it, and never revert it. Stage files by explicit path — never `git add -A` or `git commit -a`.
- **Running the `api` tests locally: use `DB_HOST=` to blank the database host.** `apps/api/.env` sets a `DB_HOST` pointing at a Postgres that is not running in this environment, so `pnpm exec nx run api:test` fails 7 test *files* — every `src/database/migrations/*.smoke.spec.ts` — at suite setup, with 0 individual test failures. CI has no `.env`, so those specs skip there and the job is green. Verified on a clean tree before Task 1. **The command to run and trust is:**

  ```bash
  cd apps/api && DB_HOST= pnpm exec vitest run && cd ..
  ```

  Expected on a clean tree: `Test Files 102 passed | 7 skipped (109)`, `Tests 1276 passed | 9 skipped`. To target ONE spec, append its name AND disable coverage: `DB_HOST= pnpm exec vitest run recipe-invariants --coverage.enabled=false`. The `--coverage.enabled=false` is required on any filtered run: coverage thresholds are global (98/95/97/89%), so running a single spec file reports ~0% and exits non-zero even when every test passes. Without the flag the exit code tells you nothing. Keep coverage ON for full-suite runs — there it is the real gate. Do not treat the 7 migration-smoke file failures as caused by your change, and do not try to fix them — but if the *individual test* count ever shows a failure, that is real and yours to fix.
- **Do not touch `apps/landing/src/content/apply-for-temporary-restaurant-licence/start.md`.** It is deleted by PR #2242, separately.
- **Contact details, verbatim, on every surface:** Ministry of Health and Wellness / `info@health.gov.bb` / `+1 (246) 536-3800`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json` | The whole served contract: steps, fields, validations, conditionals, processors, routing | 1–4 |
| `apps/api/src/forms/form-definitions/request-an-environmental-health-officer.spec.ts` | Guards the two behaviours the sweep gates cannot see: that the food steps are gated, and that the gate survives hydration | 3 |
| `apps/landing/src/content/request-an-environmental-health-officer/index.md` | The service's entry/guidance page and Start button | 5 |
| `apps/api/src/content/services-index.generated.ts` | Generated mirror of landing content — regenerated, never hand-edited | 5 |
| `apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md` | Existing licence page; gains one cross-link paragraph | 6 |
| `apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts` | On-demand live smoke: both branches of the gate against a deployed environment | 7–8 |

The recipe is built up across Tasks 1–4 rather than written in one shot. Each task leaves a recipe that passes every validation gate and serves a coherent journey, so a reviewer can reject one step group while accepting its neighbours.

---

### Task 1: Recipe skeleton — the gate, applicant details, and the closing steps

Produces a complete, submittable minimal journey: ask whether the user is serving food, collect who they are, review, declare, confirm.

**Files:**
- Create: `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `stepId`s `operating-restaurant`, `applicant-details`, `check-your-answers`, `declaration`, `submission-confirmation`. The `fieldId` `operating-restaurant` (values `"yes"` / `"no"`) in step `operating-restaurant` — Tasks 3 and 4 target it. The `fieldId`s `applicant-first-name`, `applicant-last-name`, `email`, `mobile-number` in step `applicant-details` — the webhook `mapping.applicant` paths depend on them.

- [ ] **Step 1: Confirm the gates currently pass, so a later failure is attributable**

```bash
pnpm validate-recipes
cd apps/api && DB_HOST= pnpm exec vitest run recipe-invariants --coverage.enabled=false && cd ..
```

Expected: both PASS. You have added nothing yet; this is the baseline.

- [ ] **Step 2: Create the recipe file**

Create `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json` with exactly this content:

```json
{
  "formId": "request-an-environmental-health-officer",
  "title": "Request an environmental health officer",
  "description": "Request an environmental health officer to attend an event where food or drink is served to the public.",
  "createdAt": "2026-08-10T00:00:00Z",
  "updatedAt": "2026-08-10T00:00:00Z",
  "contactDetails": {
    "title": "Ministry of Health and Wellness",
    "email": "info@health.gov.bb",
    "telephoneNumber": "+1 (246) 536-3800"
  },
  "processors": [
    {
      "type": "email",
      "config": {
        "subject": "Your request for an environmental health officer has been received",
        "recipientField": "applicant-details.email"
      }
    },
    {
      "type": "email",
      "config": {
        "subject": "A new request for an environmental health officer has been received",
        "recipientField": "catchment.mdaEmail"
      }
    },
    {
      "type": "webhook",
      "config": {
        "mapping": {
          "programmeCode": "ENV_HEALTH_OFFICER_REQUEST",
          "applicant": {
            "name": [
              "applicant-details.applicant-first-name",
              "applicant-details.applicant-last-name"
            ],
            "email": "applicant-details.email",
            "phone": "applicant-details.mobile-number"
          },
          "excludeSteps": [
            "check-your-answers",
            "declaration",
            "submission-confirmation"
          ],
          "groupByStep": true
        }
      }
    }
  ],
  "steps": [
    {
      "stepId": "operating-restaurant",
      "title": "Are you operating a temporary restaurant?",
      "elements": [
        {
          "ref": "components/generic-radio",
          "overrides": {
            "label": "Are you operating a temporary restaurant (serving food) at this event?",
            "fieldId": "operating-restaurant",
            "hint": "A temporary restaurant is any set-up serving food or drink to the public for 30 days or less. If you are serving food, you also need a temporary restaurant licence — we will collect that in this same form.",
            "options": [
              { "label": "Yes", "value": "yes" },
              { "label": "No", "value": "no" }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Select whether you are operating a temporary restaurant at this event"
              }
            }
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "operating-restaurant-licence-notice",
            "variant": "inset",
            "content": "Because you are serving food, this request also includes your application for a temporary restaurant licence. We will ask about the food you serve and your food-safety arrangements.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "operating-restaurant",
                "operator": "equal",
                "value": "yes"
              }
            ]
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "operating-restaurant-licence-info",
            "variant": "text",
            "content": "You **do not need** to fill out a separate temporary restaurant licence form.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "operating-restaurant",
                "operator": "equal",
                "value": "yes"
              }
            ]
          }
        }
      ]
    },
    {
      "stepId": "applicant-details",
      "title": "Your details",
      "elements": [
        {
          "ref": "components/first-name",
          "overrides": {
            "label": "First name",
            "fieldId": "applicant-first-name"
          }
        },
        {
          "ref": "components/middle-name",
          "overrides": {
            "label": "Middle name (optional)",
            "fieldId": "applicant-middle-name"
          }
        },
        {
          "ref": "components/last-name",
          "overrides": {
            "label": "Last name",
            "fieldId": "applicant-last-name"
          }
        },
        {
          "ref": "components/address",
          "overrides": {
            "label": "Address line 1",
            "fieldId": "applicant-address-line-1"
          }
        },
        {
          "ref": "components/address",
          "overrides": {
            "label": "Address line 2 (optional)",
            "fieldId": "applicant-address-line-2",
            "validations": {
              "required": {
                "value": false
              }
            }
          }
        },
        {
          "ref": "components/parish",
          "overrides": {
            "label": "Parish",
            "fieldId": "applicant-parish"
          }
        },
        {
          "ref": "components/mobile-telephone",
          "overrides": {
            "label": "Mobile number",
            "fieldId": "mobile-number",
            "hint": "We will use your mobile number to contact you. For example, (246) 249 1234."
          }
        },
        {
          "ref": "components/home-telephone",
          "overrides": {
            "label": "Home telephone (optional)",
            "hint": "For example, (246) 433 1234.",
            "validations": {
              "required": {
                "value": false
              }
            }
          }
        },
        {
          "ref": "components/work-telephone",
          "overrides": {
            "label": "Work telephone (optional)",
            "validations": {
              "required": {
                "value": false
              }
            }
          }
        },
        {
          "ref": "components/email",
          "overrides": {
            "label": "Email address",
            "hint": "We will use this to contact you about your request. For example, you@example.com."
          }
        }
      ]
    },
    {
      "stepId": "check-your-answers",
      "title": "Check your answers",
      "description": "Review all the information you have provided before submitting your request.",
      "elements": [],
      "behaviours": []
    },
    {
      "stepId": "declaration",
      "title": "Declaration",
      "elements": [
        {
          "ref": "components/confirmation",
          "overrides": {
            "label": "Declaration",
            "fieldId": "declaration-confirmed",
            "options": [
              {
                "label": "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.",
                "value": "confirmed"
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "You must confirm the declaration to continue"
              }
            }
          }
        },
        {
          "ref": "components/confirmation",
          "overrides": {
            "label": "Temporary restaurant regulations",
            "fieldId": "regulations-acknowledged",
            "ui": {
              "hideLabel": true
            },
            "options": [
              {
                "label": "I will operate the temporary restaurant in accordance with the Health Services (Restaurants) Regulations, 1969.",
                "value": "acknowledged"
              }
            ],
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetStepId": "operating-restaurant",
                "targetFieldId": "operating-restaurant",
                "operator": "equal",
                "value": "yes"
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "You must confirm you will follow the temporary restaurant regulations to continue"
              }
            }
          }
        },
        {
          "ref": "components/confirmation",
          "overrides": {
            "label": "Officer overtime costs",
            "fieldId": "overtime-costs-acknowledged",
            "ui": {
              "hideLabel": true
            },
            "options": [
              {
                "label": "I understand that the event organiser is responsible for the overtime costs of the environmental health officers who provide public health surveillance and inspection during the event.",
                "value": "acknowledged"
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "You must confirm you understand the overtime costs to continue"
              }
            }
          }
        }
      ]
    },
    {
      "stepId": "submission-confirmation",
      "title": "Request submitted",
      "elements": [],
      "markdownContent": "A copy of your request has been sent to the email address you gave and to the Environmental Health Department at **{polyclinic}**.\n\n## What happens next\n\n- The Environmental Health Department at **{polyclinic}** will review your request.\n- Environmental health officers will attend on the dates and times you gave. The department will confirm arrangements and any overtime costs.\n- If there are overtime costs, they will send an invoice after the request is approved. The fees are payable in advance to the Accountant General.\n- If you are also operating a temporary restaurant, this request includes your licence application. An officer checks your set-up and issues the licence at the event, not in advance. It is valid for 30 days from the date it is issued.\n\nKeep your reference number for any follow-up."
    }
  ],
  "meta": {
    "visibility": "draft"
  }
}
```

- [ ] **Step 3: Run the recipe validation gates**

```bash
pnpm validate-recipes
```

Expected: PASS, with the new recipe counted. If it fails on `unresolvable ref`, a `ref` string is misspelled — compare against `packages/registry/src/components/`. If it fails on the webhook guard, re-read the Global Constraints entry for `mapping`.

- [ ] **Step 4: Run the invariants sweep**

```bash
cd apps/api && DB_HOST= pnpm exec vitest run recipe-invariants --coverage.enabled=false && cd ..
```

Expected: PASS. This proves the file parses under `serviceContractRecipeSchema`, `formId` matches the filename, and no `stepId` or authored `fieldId` is duplicated.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json
git commit -m "feat(forms): add the environmental health officer request recipe skeleton

The gate question, applicant details, and the closing check/declaration/
confirmation steps. Event, food and document steps follow."
```

---

### Task 2: The event step and catchment routing

Adds the step that drives which Environmental Health Department receives the request.

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json`

**Interfaces:**
- Consumes: the `steps` array from Task 1.
- Produces: `stepId` `event-details`, containing `fieldId`s `event-parish` and `event-address-coordinates` — the two fields `catchmentRouting` reads.

- [ ] **Step 1: Insert the `event-details` step**

In the `steps` array, insert this object **between** the `applicant-details` step and the `check-your-answers` step:

```json
    {
      "stepId": "event-details",
      "title": "About the event",
      "elements": [
        {
          "ref": "components/generic-text",
          "overrides": {
            "label": "Name of event",
            "fieldId": "event-name",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the name of the event"
              }
            }
          }
        },
        {
          "ref": "components/address-lookup",
          "overrides": {
            "label": "Event address line 1",
            "fieldId": "event-address-line-1",
            "hint": "Start typing, then choose your location from the list. We use it to send your request to the polyclinic that covers the area.",
            "geocodeTargets": {
              "line2FieldId": "event-address-line-2",
              "parishFieldId": "event-parish",
              "coordinatesFieldId": "event-address-coordinates"
            }
          }
        },
        {
          "ref": "components/address",
          "overrides": {
            "label": "Event address line 2 (optional)",
            "fieldId": "event-address-line-2",
            "validations": {
              "required": {
                "value": false
              }
            }
          }
        },
        {
          "ref": "components/parish",
          "overrides": {
            "label": "Parish of event",
            "fieldId": "event-parish"
          }
        },
        {
          "ref": "components/generic-text",
          "overrides": {
            "label": "Event location coordinates",
            "fieldId": "event-address-coordinates",
            "ui": {
              "hidden": true
            },
            "validations": {
              "required": {
                "value": false
              }
            }
          }
        },
        {
          "ref": "components/generic-date",
          "overrides": {
            "label": "Start date",
            "fieldId": "event-from",
            "hint": "The first day of the event. You must apply at least 14 days before this date. For example, 27 8 2026.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the event start date"
              },
              "min": {
                "value": 14,
                "transform": "daysUntil",
                "error": "You must apply at least 14 days before the event start date"
              }
            }
          }
        },
        {
          "ref": "components/generic-date",
          "overrides": {
            "label": "End date",
            "fieldId": "event-to",
            "hint": "The last day of the event.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the event end date"
              },
              "onOrAfter": {
                "referenceFieldId": "event-from",
                "referenceStepId": "event-details",
                "error": "The end date must be the same as or after the start date"
              }
            }
          }
        },
        {
          "ref": "components/generic-time",
          "overrides": {
            "label": "Start time",
            "fieldId": "event-start-time",
            "hint": "The time the event starts each day. For example, 4:00pm.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the time the event will start each day"
              }
            }
          }
        },
        {
          "ref": "components/generic-time",
          "overrides": {
            "label": "End time",
            "fieldId": "event-end-time",
            "hint": "The time the event finishes each day. If it runs past midnight, enter the time it ends — for example, 2:00am.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the time the event will finish each day"
              }
            }
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "event-officer-reg-note",
            "variant": "details",
            "summary": "Why you do not choose officer times",
            "content": "The Environmental Health Department assigns officers based on your event's dates and times. This follows the Health Services (Assignment of Public Health Inspectors to Private Businesses) Regulations, 1986, which set officers' working days and hours (regulation 2 and the First Schedule) and the fees for attendance outside those hours (regulation 7 and the Second Schedule)."
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "event-size-note",
            "variant": "text",
            "content": "Give your best estimate of the size of your event. We know these numbers change — you will not be penalised if they do."
          }
        },
        {
          "ref": "components/generic-number",
          "overrides": {
            "label": "Expected number of patrons",
            "fieldId": "num-patrons",
            "hint": "For example, 300.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the expected number of patrons"
              },
              "min": {
                "value": 0,
                "error": "Enter 0 or more"
              }
            }
          }
        },
        {
          "ref": "components/generic-number",
          "overrides": {
            "label": "Number of food stalls, including bars",
            "fieldId": "num-stalls",
            "hint": "Count each bar as a stall. For example, 4.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the number of food stalls including bars"
              },
              "min": {
                "value": 0,
                "error": "Enter 0 or more"
              }
            }
          }
        }
      ]
    },
```

- [ ] **Step 2: Add `catchmentRouting` at the top level**

Insert this key between `processors` and `steps`:

```json
  "catchmentRouting": {
    "coordinatesField": "event-details.event-address-coordinates",
    "parishField": "event-details.event-parish"
  },
```

- [ ] **Step 3: Run the recipe gates**

```bash
pnpm validate-recipes && cd apps/api && DB_HOST= pnpm exec vitest run recipe-invariants --coverage.enabled=false && cd ..
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json
git commit -m "feat(forms): add the event step and catchment routing to the officer request

Geocoded event address populates the hidden coordinates and the parish, which
route the request to the Environmental Health Department serving the area."
```

---

### Task 3: The conditional food steps, with a test that the gate survives hydration

Adds the two steps that only exist when the requester is serving food, and the one spec this work genuinely needs: `stepConditionalOn` is new to this repo's recipes, and a step-level property is silently dropped from the served contract if `hydrateStep` does not carry it. That failure mode is invisible to `validate-recipes` and to the invariants sweep — both read the file on disk, not the hydrated output.

**Files:**
- Create: `apps/api/src/forms/form-definitions/request-an-environmental-health-officer.spec.ts`
- Modify: `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json`

**Interfaces:**
- Consumes: `stepId` `operating-restaurant` and `fieldId` `operating-restaurant` from Task 1; the `steps` array position after `event-details` from Task 2.
- Produces: `stepId`s `food-details` and `food-safety`, each carrying a `stepConditionalOn` behaviour. The `fieldId` `food-source` (multi-option checkbox, values `"supplier"` and `"caterer"`) — Task 7's smoke spec ticks it.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/forms/form-definitions/request-an-environmental-health-officer.spec.ts`:

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "../../registry/resolution";

// The food steps are the only conditional STEPS in the recipe set, and a
// step-level property that hydrateForm does not carry through is dropped
// silently from the served contract — the form would then always show the food
// steps, including to someone who is not serving food. validate-recipes and
// recipe-invariants.spec.ts both read the file on disk, so neither can see
// that. This spec hydrates the real recipe and asserts the gate survives.
const RECIPE_PATH = path.resolve(
  __dirname,
  "recipes/request-an-environmental-health-officer.json",
);

const GATED_STEP_IDS = ["food-details", "food-safety"];

async function hydratedSteps() {
  const raw = JSON.parse(await fs.readFile(RECIPE_PATH, "utf8"));
  const recipe = serviceContractRecipeSchema.parse(raw);
  // Resolver = (ref: string) => Promise<RegistryEntry | null>. Every ref in
  // this recipe is a builtin, so a miss is a bug in the recipe, not a
  // DB-backed custom component — fail loudly rather than returning null.
  const resolver: Resolver = async (ref) => {
    const entry = BUILTIN_REGISTRY[ref as keyof typeof BUILTIN_REGISTRY];
    if (!entry) throw new Error(`unresolvable ref "${ref}"`);
    return entry;
  };
  const hydrated = await hydrateForm(recipe, resolver);
  return hydrated.steps as unknown as {
    stepId: string;
    behaviours?: { type: string; targetStepId?: string; targetFieldId?: string; operator?: string; value?: unknown }[];
  }[];
}

it.each(GATED_STEP_IDS)(
  "gates the %s step on operating-restaurant = yes, and the gate survives hydration",
  async (stepId) => {
    const steps = await hydratedSteps();
    const step = steps.find((s) => s.stepId === stepId);
    expect(step, `step "${stepId}" is missing from the recipe`).toBeDefined();

    const gates = (step!.behaviours ?? []).filter(
      (b) => b.type === "stepConditionalOn",
    );
    expect(
      gates,
      `step "${stepId}" lost its stepConditionalOn behaviour in hydration`,
    ).toHaveLength(1);
    expect(gates[0]).toMatchObject({
      type: "stepConditionalOn",
      targetStepId: "operating-restaurant",
      targetFieldId: "operating-restaurant",
      operator: "equal",
      value: "yes",
    });
  },
);

it("leaves every other step ungated, so the officer request always runs", async () => {
  const steps = await hydratedSteps();
  const ungated = steps
    .filter((s) => !GATED_STEP_IDS.includes(s.stepId))
    .filter((s) =>
      (s.behaviours ?? []).some((b) => b.type === "stepConditionalOn"),
    )
    .map((s) => s.stepId);
  expect(ungated).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && DB_HOST= pnpm exec vitest run request-an-environmental-health-officer --coverage.enabled=false && cd ..
```

Expected: FAIL — two failures reading `step "food-details" is missing from the recipe` and `step "food-safety" is missing from the recipe`. The third test passes (vacuously — there are no gated steps yet).

- [ ] **Step 3: Insert the `food-details` step**

In the `steps` array, insert this object **between** `event-details` and `check-your-answers`. The `groups` list is copied from the licence recipe deliberately — the two services must offer the same food taxonomy.

```json
    {
      "stepId": "food-details",
      "title": "What food and drink will you serve?",
      "description": "Tick the items you will serve in each category that applies. Categories marked higher-risk need extra care and may affect how your set-up is inspected.",
      "behaviours": [
        {
          "type": "stepConditionalOn",
          "targetStepId": "operating-restaurant",
          "targetFieldId": "operating-restaurant",
          "operator": "equal",
          "value": "yes"
        }
      ],
      "elements": [
        {
          "ref": "components/generic-checkbox-accordion",
          "overrides": {
            "label": "Food and drink you will serve",
            "fieldId": "food-served",
            "hint": "Open each category that applies and tick the items you will serve.",
            "groups": [
              {
                "label": "Meat and poultry",
                "higherRisk": true,
                "options": [
                  { "label": "Chicken", "value": "chicken" },
                  { "label": "Lamb", "value": "lamb" },
                  { "label": "Beef", "value": "beef" },
                  { "label": "Pork", "value": "pork" },
                  { "label": "Duck", "value": "duck" },
                  { "label": "Rabbit", "value": "rabbit" },
                  { "label": "Goat", "value": "goat" },
                  { "label": "Turkey", "value": "turkey" },
                  { "label": "Hotdogs", "value": "hotdogs" },
                  { "label": "Burgers", "value": "burgers" },
                  { "label": "Souse", "value": "souse" },
                  { "label": "Canned meats", "value": "canned-meats" },
                  { "label": "Tacos", "value": "tacos" }
                ]
              },
              {
                "label": "Seafood and fish products",
                "higherRisk": true,
                "options": [
                  { "label": "Fish", "value": "fish" },
                  { "label": "Fish cakes", "value": "fish-cakes" },
                  { "label": "Canned fish", "value": "canned-fish" },
                  { "label": "Shrimp", "value": "shrimp" },
                  { "label": "Crab", "value": "crab" },
                  { "label": "Lobster", "value": "lobster" },
                  { "label": "Sushi", "value": "sushi" }
                ]
              },
              {
                "label": "Dairy products",
                "higherRisk": true,
                "options": [
                  { "label": "Ice-cream", "value": "ice-cream" },
                  { "label": "Cheese", "value": "cheese" },
                  { "label": "Milk products", "value": "milk-products" }
                ]
              },
              {
                "label": "Eggs and egg products",
                "higherRisk": true,
                "options": [
                  { "label": "Eggs", "value": "eggs" },
                  { "label": "Salads", "value": "salads" },
                  { "label": "Pastries", "value": "pastries" },
                  { "label": "Other baked goods", "value": "other-baked-goods" }
                ]
              },
              {
                "label": "Cooked rice, pasta and starches",
                "options": [
                  { "label": "Rice", "value": "rice" },
                  { "label": "Macaroni pie", "value": "macaroni-pie" },
                  { "label": "Pasta", "value": "pasta" },
                  { "label": "Cou-cou", "value": "cou-cou" },
                  { "label": "Fries", "value": "fries" },
                  { "label": "English or Irish potato", "value": "english-or-irish-potato" },
                  { "label": "Sweet potato", "value": "sweet-potato" },
                  { "label": "Breadfruit", "value": "breadfruit" },
                  { "label": "Cassava", "value": "cassava" },
                  { "label": "Soup", "value": "soup" },
                  { "label": "Dry goods", "value": "dry-goods" }
                ]
              },
              {
                "label": "Fresh fruits and vegetables",
                "options": [
                  { "label": "Fruits and vegetables (sliced or diced)", "value": "fruits-and-vegetables" }
                ]
              },
              {
                "label": "Salads and condiments",
                "options": [
                  { "label": "Tossed salad", "value": "tossed-salad" },
                  { "label": "Cold salads", "value": "cold-salads" },
                  { "label": "Condiments", "value": "condiments" }
                ]
              },
              {
                "label": "Snacks and sweets",
                "options": [
                  { "label": "Popcorn", "value": "popcorn" },
                  { "label": "Cotton candy", "value": "cotton-candy" },
                  { "label": "Packaged goods", "value": "packaged-goods" },
                  { "label": "Confectioneries", "value": "confectioneries" },
                  { "label": "Jams and jellies", "value": "jams-and-jellies" }
                ]
              },
              {
                "label": "Drinks and beverages",
                "options": [
                  { "label": "Soft drinks", "value": "soft-drinks" },
                  { "label": "Homemade juices", "value": "homemade-juices" },
                  { "label": "Coconut water", "value": "coconut-water" },
                  { "label": "Slushies", "value": "slushies" },
                  { "label": "Sno-cones", "value": "sno-cones" },
                  { "label": "Wines and spirits", "value": "wines-and-spirits" }
                ]
              },
              {
                "label": "Other food",
                "options": [{ "label": "Other food", "value": "other" }]
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Select at least one food or drink item you will serve"
              }
            }
          }
        },
        {
          "ref": "components/generic-textarea",
          "overrides": {
            "label": "What else will you serve?",
            "fieldId": "other-food-description",
            "hint": "Describe the main ingredients and how you will cook it. This is how we grade the risk, so an officer knows what to expect.",
            "ui": {
              "width": "long",
              "indent": true
            },
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-served",
                "operator": "in",
                "value": ["other"]
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Tell us what else you will serve"
              }
            }
          }
        },
        {
          "ref": "components/generic-checkbox",
          "overrides": {
            "label": "Where will you get your food from?",
            "fieldId": "food-source",
            "hint": "Tick everything that applies.",
            "options": [
              { "label": "Supplier", "value": "supplier" },
              { "label": "Caterer or cook", "value": "caterer" }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Select where you will get your food from"
              }
            }
          }
        },
        {
          "ref": "components/generic-textarea",
          "overrides": {
            "label": "Which suppliers will you use?",
            "fieldId": "supplier-details",
            "hint": "A short list is enough. You do not need to name every item. For example, fish from Oistins market; flour and oil from a wholesaler; beer from a supermarket.",
            "ui": {
              "width": "long",
              "indent": true
            },
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-source",
                "operator": "in",
                "value": ["supplier"]
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Tell us which suppliers you will use"
              }
            }
          }
        },
        {
          "ref": "components/generic-text",
          "overrides": {
            "label": "Name of the caterer or cook",
            "fieldId": "caterer-name",
            "hint": "The business or person preparing the food. Only give this if someone other than you is preparing it.",
            "ui": { "indent": true },
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-source",
                "operator": "in",
                "value": ["caterer"]
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the name of the caterer or cook"
              }
            }
          }
        },
        {
          "ref": "components/address",
          "overrides": {
            "label": "Their address",
            "fieldId": "caterer-address",
            "ui": { "indent": true },
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-source",
                "operator": "in",
                "value": ["caterer"]
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the address of the caterer or cook"
              }
            }
          }
        },
        {
          "ref": "components/generic-tel",
          "overrides": {
            "label": "Their phone number",
            "fieldId": "caterer-phone",
            "hint": "For example, (246) 249 1234.",
            "ui": { "indent": true },
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-source",
                "operator": "in",
                "value": ["caterer"]
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the phone number of the caterer or cook"
              },
              "phone": {
                "value": true,
                "error": "Please enter a valid phone number"
              }
            }
          }
        },
        {
          "ref": "components/generic-email",
          "overrides": {
            "label": "Their email address (optional)",
            "fieldId": "caterer-email",
            "hint": "For example, cook@example.com.",
            "ui": { "indent": true },
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-source",
                "operator": "in",
                "value": ["caterer"]
              }
            ],
            "validations": {
              "required": {
                "value": false
              },
              "email": {
                "value": true,
                "error": "Enter a valid email address"
              }
            }
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "caterer-licence-note",
            "variant": "text",
            "content": "You do not need to send us the caterer's or cook's licence.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "food-source",
                "operator": "in",
                "value": ["caterer"]
              }
            ]
          }
        }
      ]
    },
```

- [ ] **Step 4: Insert the `food-safety` step**

Insert this object **between** `food-details` and `check-your-answers`:

```json
    {
      "stepId": "food-safety",
      "title": "Food safety",
      "behaviours": [
        {
          "type": "stepConditionalOn",
          "targetStepId": "operating-restaurant",
          "targetFieldId": "operating-restaurant",
          "operator": "equal",
          "value": "yes"
        }
      ],
      "elements": [
        {
          "ref": "components/generic-radio",
          "overrides": {
            "label": "Do you already have a valid food business licence?",
            "fieldId": "has-food-licence",
            "hint": "A current licence for your own food business or premises.",
            "options": [
              { "label": "Yes", "value": "yes" },
              { "label": "No", "value": "no" }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Select whether you already have a valid food business licence"
              }
            }
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "food-handlers-note",
            "variant": "details",
            "summary": "Why we ask, and what officers may check on the day",
            "content": "The number tells us how many people an officer needs to check at your stall. Everyone handling food must wear a hairnet, wear a beard net if they have a beard, remove jewellery, and keep nails short, clean and free of varnish or false nails.\n\nEach person needs their own valid medical certificate with them on the day. You only upload your own — we check the rest at the stall.\n\nWe know who works an event can change at short notice. Give the number you expect; you will not be penalised if the people change.\n\n[Read the full hygiene requirements](/business-trade/temporary-restaurants-what-you-need-to-know#personal-hygiene-for-food-handlers)"
          }
        },
        {
          "ref": "components/generic-number",
          "overrides": {
            "label": "Number of male food handlers",
            "fieldId": "handlers-male",
            "hint": "For example, 2.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the number of male food handlers"
              },
              "min": {
                "value": 0,
                "error": "Enter 0 or more"
              }
            }
          }
        },
        {
          "ref": "components/generic-number",
          "overrides": {
            "label": "Number of female food handlers",
            "fieldId": "handlers-female",
            "hint": "For example, 3.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the number of female food handlers"
              },
              "min": {
                "value": 0,
                "error": "Enter 0 or more"
              }
            }
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "water-sanitation-note",
            "variant": "details",
            "summary": "Why we ask about water and sanitation",
            "content": "Running water is mandatory. A stall without it can be closed on the day, and a licence cannot be issued in advance because an officer has to verify this in place.\n\n**Contact your event organiser to check whether water will be available — but be prepared to bring your own.** Vendors have arrived at events expecting water to be provided and found none. Whoever supplies it, it is your stall that is closed without it.\n\n[Read more about keeping food safe](/business-trade/temporary-restaurants-what-you-need-to-know#keeping-food-safe)"
          }
        },
        {
          "ref": "components/generic-text",
          "overrides": {
            "label": "Water source",
            "fieldId": "water-source",
            "hint": "Where will safe water come from? For example, mains supply, a water tank, or bottled water.",
            "validations": {
              "required": {
                "value": true,
                "error": "Enter the water source for the event"
              }
            }
          }
        },
        {
          "ref": "components/generic-text",
          "overrides": {
            "label": "Handwashing arrangements",
            "fieldId": "handwashing",
            "hint": "For example, a portable handwashing station with soap and paper towels.",
            "validations": {
              "required": {
                "value": true,
                "error": "Describe the handwashing arrangements"
              }
            }
          }
        },
        {
          "ref": "components/generic-text",
          "overrides": {
            "label": "Waste disposal",
            "fieldId": "waste-disposal",
            "hint": "How will food waste and rubbish be stored and removed?",
            "validations": {
              "required": {
                "value": true,
                "error": "Describe how waste will be disposed of"
              }
            }
          }
        }
      ]
    },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/api && DB_HOST= pnpm exec vitest run request-an-environmental-health-officer --coverage.enabled=false && cd ..
```

Expected: PASS, three tests. If a gated step fails with "lost its stepConditionalOn behaviour in hydration", the step-level `behaviours` key is not being carried by `hydrateStep` — stop and report it; that is an `apps/api` bug, not a recipe bug, and this plan does not authorise an `apps/api` change.

- [ ] **Step 6: Run the recipe gates**

```bash
pnpm validate-recipes && cd apps/api && DB_HOST= pnpm exec vitest run recipe-invariants --coverage.enabled=false && cd ..
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json apps/api/src/forms/form-definitions/request-an-environmental-health-officer.spec.ts
git commit -m "feat(forms): add the conditional food steps to the officer request

food-details and food-safety are gated with stepConditionalOn so they only
run when the requester is serving food. The accompanying spec hydrates the
real recipe and asserts the gate survives hydration — neither
validate-recipes nor recipe-invariants can see that, since both read the
file on disk rather than the served contract."
```

---

### Task 4: The documents step

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json`

**Interfaces:**
- Consumes: `stepId` `operating-restaurant` and `fieldId` `operating-restaurant` from Task 1.
- Produces: `stepId` `documents` with `fieldId`s `vendor-list`, `site-plan`, `medical-certs`, `food-licence`.

- [ ] **Step 1: Insert the `documents` step**

Insert this object **between** `food-safety` and `check-your-answers`. Note `medical-certs` is single-file here — the prototype asks only for the requester's own certificate — unlike the licence recipe's `multiple: true`.

```json
    {
      "stepId": "documents",
      "title": "Supporting documents",
      "description": "Upload your list of vendors and a site or stall plan.",
      "elements": [
        {
          "ref": "components/upload-document",
          "overrides": {
            "label": "List of vendors",
            "fieldId": "vendor-list",
            "hint": "A list of the food vendors taking part in your event. PDF, JPG, PNG, DOC or DOCX.",
            "validations": {
              "required": {
                "value": true,
                "error": "Upload your list of vendors"
              },
              "fileTypes": {
                "value": [
                  "application/pdf",
                  "image/jpeg",
                  "image/png",
                  "application/msword",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ],
                "error": "Upload a PDF, JPG, PNG, DOC or DOCX"
              }
            }
          }
        },
        {
          "ref": "components/upload-document",
          "overrides": {
            "label": "Site or stall plan",
            "fieldId": "site-plan",
            "hint": "A plan of the event site, showing stall positions, waste disposal, water supply and facilities. PDF, JPG or PNG.",
            "validations": {
              "required": {
                "value": true,
                "error": "Upload a site or stall plan"
              },
              "fileTypes": {
                "value": ["application/pdf", "image/jpeg", "image/png"],
                "error": "Upload a PDF, JPG or PNG"
              }
            }
          }
        },
        {
          "ref": "components/upload-document",
          "overrides": {
            "label": "Your medical certificate",
            "fieldId": "medical-certs",
            "hint": "Your own valid medical certificate. PDF, JPG or PNG.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetStepId": "operating-restaurant",
                "targetFieldId": "operating-restaurant",
                "operator": "equal",
                "value": "yes"
              }
            ],
            "validations": {
              "required": {
                "value": true,
                "error": "Upload your medical certificate"
              },
              "fileTypes": {
                "value": ["application/pdf", "image/jpeg", "image/png"],
                "error": "Upload a PDF, JPG or PNG"
              },
              "itemMaxSize": {
                "value": 5242880,
                "error": "Each file must be 5 MB or smaller"
              }
            }
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "medical-certs-note",
            "variant": "inset",
            "content": "You only upload your own. Everyone else working with you on the day must **walk with their own valid medical certificate** — the officer checks them at the stall. We know your team can change at short notice, so there is nothing to upload for them here.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetStepId": "operating-restaurant",
                "targetFieldId": "operating-restaurant",
                "operator": "equal",
                "value": "yes"
              }
            ]
          }
        },
        {
          "ref": "components/upload-document",
          "overrides": {
            "label": "Food business licence (optional)",
            "fieldId": "food-licence",
            "hint": "A copy of your valid food business licence, if you have one. PDF, JPG or PNG.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetStepId": "operating-restaurant",
                "targetFieldId": "operating-restaurant",
                "operator": "equal",
                "value": "yes"
              }
            ],
            "validations": {
              "fileTypes": {
                "value": ["application/pdf", "image/jpeg", "image/png"],
                "error": "Upload a PDF, JPG or PNG"
              }
            }
          }
        }
      ]
    },
```

- [ ] **Step 2: Verify the final step order**

Run:

```bash
node -e "console.log(require('./apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json').steps.map(s=>s.stepId).join(' -> '))"
```

Expected, exactly:

```
operating-restaurant -> applicant-details -> event-details -> food-details -> food-safety -> documents -> check-your-answers -> declaration -> submission-confirmation
```

If the order differs, move the step objects until it matches — the array order is the journey order.

- [ ] **Step 3: Run every recipe gate and the full api suite**

```bash
pnpm validate-recipes && (cd apps/api && DB_HOST= pnpm exec vitest run) 
```

Expected: PASS. The full `api` suite is cheap (~30s) and catches anything the targeted runs missed.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json
git commit -m "feat(forms): add the documents step to the officer request

Vendor list and site plan are always required (the requester is always the
organiser here). The medical certificate and optional food licence appear
only when the requester is also serving food."
```

---

### Task 5: The landing content page

**Files:**
- Create: `apps/landing/src/content/request-an-environmental-health-officer/index.md`
- Modify: `apps/api/src/content/services-index.generated.ts` (by regenerating — never by hand)

**Interfaces:**
- Consumes: the recipe's `formId` from Task 1.
- Produces: the route `/business-trade/request-an-environmental-health-officer`, which Task 6 links to.

- [ ] **Step 1: Create the content page**

Create `apps/landing/src/content/request-an-environmental-health-officer/index.md`:

```markdown
---
title: "Request an environmental health officer"
description: "Event organisers in Barbados can request an environmental health officer to attend an event where food or drink is served to the public."
stage: "alpha"
visibility: preview
featured: false
publish_date: 2026-08-10
category: business-trade
form_id: request-an-environmental-health-officer
service_type: digital
---

Use this service to request an environmental health officer to attend your event. This is required whenever food or drink is served to the public.

The first question asks whether you are operating a temporary restaurant — that is, serving food yourself. If you are, this same service also completes your **temporary restaurant licence** application. You will be asked about the food you serve, your food-safety arrangements, and asked to upload your own medical certificate.

## Who needs to request an officer

The event organiser makes this request. Individual food vendors do not — but each vendor must apply for their own [licence to operate a temporary restaurant](/business-trade/apply-for-temporary-restaurant-licence).

Read [what counts as a temporary restaurant and what your event needs](/business-trade/temporary-restaurants-what-you-need-to-know#what-counts-as-a-temporary-restaurant).

## When to apply and what it costs

Apply at least **14 days** before your event, so officers can be scheduled to attend.

There is no fee to request an officer. If there are overtime costs for officers attending, those fees are **payable in advance to the Accountant General** — the polyclinic will tell you the amount after your request is approved. See [how to pay](/business-trade/temporary-restaurants-what-you-need-to-know#paying-for-environmental-health-officers).

## What you will need

- Your name, address, phone number and email address
- The name and address of the event, and the dates and times it will run
- The expected number of patrons, and the number of food stalls including bars
- A list of the food vendors taking part
- A [site or stall plan](/business-trade/temporary-restaurants-what-you-need-to-know#setting-up-your-stall)

If you are serving food, and so also need a licence, you will also need:

- The food and drink you will serve, and where you will get it from
- Your food-safety arrangements — water, handwashing, waste disposal, and the number of food handlers
- Your own medical certificate. Everyone else working with you must carry theirs on the day
- Hairnets, beard nets and clean covered clothing for everyone handling food, and no jewellery, false nails, false eyelashes, make-up or perfume ([see the full list](/business-trade/temporary-restaurants-what-you-need-to-know#personal-hygiene-for-food-handlers))
- If you have one, a copy of your food business licence

<a data-start-link>Start now</a>

You can also make this request in person at your nearest polyclinic while we introduce this online service.

## What happens next

- The Environmental Health Department at the polyclinic for your area will review your request.
- They will contact you to arrange the officers' attendance.
- If there are overtime costs, they will send an invoice after the request is approved.

## Contact us

If you need help, contact the Ministry of Health and Wellness.

Telephone: [(246) 536-3800](tel:+12465363800)

Email: [info@health.gov.bb](mailto:info@health.gov.bb)
```

- [ ] **Step 2: Regenerate the services index**

The `generated-drift` CI job fails on any diff here, so this is not optional.

```bash
pnpm generate:services-index
```

- [ ] **Step 3: Verify the new service landed in the generated index**

```bash
git diff --stat apps/api/src/content/services-index.generated.ts
grep -A4 '"request-an-environmental-health-officer"' apps/api/src/content/services-index.generated.ts
```

Expected: the file shows a diff, and the grep prints an entry with `category: "business-trade"`, `formId: "request-an-environmental-health-officer"` and `visibility: "preview"`. If the grep finds nothing, the frontmatter is malformed — check the YAML.

- [ ] **Step 4: Confirm the generator is now idempotent**

```bash
pnpm generate:services-index && git diff --exit-code apps/api/src/content/services-index.generated.ts
```

Expected: exit code 0, no output. This is exactly what CI runs.

- [ ] **Step 5: Run the landing content tests**

```bash
pnpm exec nx run landing:test
```

Expected: PASS. `ingest-contract.test.ts` sweeps the real content corpus and hard-fails on invalid frontmatter YAML, so this is the gate on the page's frontmatter.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src/content/request-an-environmental-health-officer/index.md apps/api/src/content/services-index.generated.ts
git commit -m "feat(landing): add the environmental health officer request page

Entry page for the new service, carrying the prototype's start-screen
content with its relative links rewritten to real landing routes. Ships
visibility: preview alongside the draft recipe, so the Start button stays
suppressed until the form is published."
```

---

### Task 6: Cross-link the licence page

**Files:**
- Modify: `apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md`

**Interfaces:**
- Consumes: the route produced by Task 5.
- Produces: nothing.

- [ ] **Step 1: Add the cross-link paragraph**

In `apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md`, find the `## Who needs a licence` section. It currently reads:

```markdown
You need a licence if you will serve any food or drink at an event, whether you sell it or give it away, including free samples. Both the event organiser and each food vendor must apply. Read [what counts as a temporary restaurant, who must apply, and what your event needs](/business-trade/temporary-restaurants-what-you-need-to-know#what-counts-as-a-temporary-restaurant).
```

Insert this as a **new paragraph immediately after** it:

```markdown
If you are organising the event but not serving food yourself, you do not need a licence — use [Request an environmental health officer](/business-trade/request-an-environmental-health-officer) instead.
```

Change nothing else in this file. In particular, leave the commented-out "Apply online" block alone — it is cleared with PR #2242's start-page removal, not here.

- [ ] **Step 2: Confirm the services index is unaffected**

Body-only edits do not change the generated index, so this must be a no-op.

```bash
pnpm generate:services-index && git diff --exit-code apps/api/src/content/services-index.generated.ts
```

Expected: exit code 0, no output.

- [ ] **Step 3: Run the landing tests**

```bash
pnpm exec nx run landing:test
```

Expected: PASS.

- [ ] **Step 4: Verify the diff is one paragraph**

```bash
git diff apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md
```

Expected: exactly one added paragraph, no other changed lines.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md
git commit -m "feat(landing): link the licence page to the officer request service

Framed as the organiser's door rather than a second task, so it does not
contradict the licence form's own copy, which tells organisers we request
the officer for them."
```

---

### Task 7: Live smoke — the serving-food branch

An on-demand Playwright spec that drives the real deployed form and submits for real. Like every spec under `e2e/smoke`, it runs only via `playwright.smoke.config.ts` and no workflow runs it automatically. A `draft` recipe is reachable with a valid preview token, which bypasses the launch gate, so this works before publication.

**Files:**
- Create: `apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts`

**Interfaces:**
- Consumes: every `stepId` and `fieldId` from Tasks 1–4. Field inputs are addressed `${stepId}_${fieldId}`; a checkbox or radio option is `${stepId}_${fieldId}-${optionValue}`.
- Produces: the helper `buildData()` and the constant `FORM_ID`, both reused by Task 8.

- [ ] **Step 1: Write the spec**

Create `apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts`:

```typescript
/**
 * request-an-environmental-health-officer.smoke.spec.ts
 *
 * Live, on-demand smoke tests for the Request an Environmental Health Officer
 * service (formId `request-an-environmental-health-officer`).
 *
 * These drive the REAL deployed form (default: sandbox), fill every step with
 * valid @faker-js/faker data, SUBMIT FOR REAL, and assert the confirmation
 * screen is reached with a reference code.
 *
 * Like the other specs under e2e/smoke they run ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (ADR 0027 / 0029), and no workflow runs them automatically.
 *
 * Run them on demand (from the repo root):
 *   PREVIEW_TOKEN=… pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts request-an-environmental-health-officer
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment (default https://forms.sandbox.alpha.gov.bb)
 *   PREVIEW_TOKEN    forms preview secret — appended as ?preview=<token>. REQUIRED
 *                    while the recipe is visibility:draft, because a non-public
 *                    recipe 404s without a token. Pass it on the command line so
 *                    the secret never lands in the repo.
 *   SMOKE_SLOWMO     ms delay per action for watching a headed run.
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *
 * Form-specific notes:
 *  - The whole journey hinges on `operating-restaurant`. Answering "yes" adds the
 *    food-details and food-safety steps (stepConditionalOn), two more uploads and
 *    a third declaration checkbox. This spec covers "yes"; the sibling test in
 *    this file covers "no" and asserts the food steps are skipped.
 *  - There is no National Registration Number on this form (unlike the licence),
 *    so no Maskito-masked field to type digit-by-digit.
 *  - The event address is an address-lookup (geocoder) field, so it cannot take a
 *    free-text faker address — the geocoder must return a real Barbados match to
 *    populate the hidden coordinates the catchment router reads. We faker-pick
 *    from a pool of known-geocodable locations, select the first suggestion, then
 *    assert `event-address-coordinates` filled.
 *  - food-served is a checkbox-accordion: open a category, then tick one leaf.
 *    "Other food" is a single-option group, so it renders as one plain checkbox
 *    (no expander) and ticking it reveals the required other-food-description.
 *  - food-source is a TWO-option checkbox (values "supplier" and "caterer"), so
 *    the input ids are `<step>_food-source-supplier` / `-caterer`. It gates the
 *    supplier textarea and the caterer contact fields respectively.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "request-an-environmental-health-officer";

/** Parish <select> option values (slugs) from components/parish. */
const PARISH_VALUES = [
  "christ-church",
  "st-andrew",
  "st-george",
  "st-james",
  "st-john",
  "st-joseph",
  "st-lucy",
  "st-michael",
  "st-peter",
  "st-philip",
  "st-thomas",
] as const;

/**
 * Real, geocodable Barbados locations. A free-text faker address won't resolve,
 * and the catchment router needs the hidden coordinates the geocoder writes when
 * a suggestion is picked — so the event address is chosen from this pool.
 */
const GEOCODABLE_EVENT_ADDRESSES = [
  "Jemmotts Lane, Bridgetown",
  "Broad Street, Bridgetown",
  "Speightstown",
  "Holetown",
  "Oistins",
] as const;

/**
 * Valid Barbados mobile exchanges (the `2XX` after `246`). The phone validation
 * rule runs libphonenumber-js `.isValid()` against real assignable ranges, so a
 * random `246 NNN NNNN` is rejected — the exchange must be a real one.
 */
const BB_MOBILE_EXCHANGES = [
  "230",
  "231",
  "240",
  "249",
  "250",
  "260",
  "262",
  "288",
] as const;

function bbMobileNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

/** One leaf from the non-higher-risk "Cooked rice, pasta and starches" group. */
const RICE_GROUP_LABEL = "Cooked rice, pasta and starches";
const RICE_ITEMS = [
  "Rice",
  "Macaroni pie",
  "Pasta",
  "Cou-cou",
  "Fries",
  "Sweet potato",
  "Breadfruit",
  "Cassava",
  "Soup",
] as const;

/** The "Other" escape hatch at the foot of the accordion. */
const OTHER_LABEL = "Other food";

/** Build a complete, valid set of answers for either branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  // Event start must be >= 14 days out (recipe min: daysUntil 14). Give plenty
  // of margin; end date is the same day or a few days later.
  const start = new Date();
  start.setDate(start.getDate() + faker.number.int({ min: 21, max: 120 }));
  const end = new Date(start);
  end.setDate(end.getDate() + faker.number.int({ min: 0, max: 4 }));

  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    addressLine1: faker.location.streetAddress(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    mobile: bbMobileNumber(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    applicantEmail: "testing@govtech.bb",

    // Timestamped so the resulting submission is easy to find in the target env.
    eventName: `Smoke Test — ${faker.company.buzzNoun()} festival ${new Date().toISOString()}`,
    eventAddress: faker.helpers.arrayElement(GEOCODABLE_EVENT_ADDRESSES),
    start,
    end,
    startTime: "16:00",
    endTime: "22:00",
    numPatrons: String(faker.number.int({ min: 50, max: 900 })),
    numStalls: String(faker.number.int({ min: 1, max: 20 })),

    foodItem: faker.helpers.arrayElement(RICE_ITEMS),
    otherFood: `${faker.commerce.productName()} (smoke test)`,
    supplierDetails: "Fish from Oistins market; dry goods from a wholesaler",

    handlersMale: String(faker.number.int({ min: 0, max: 6 })),
    handlersFemale: String(faker.number.int({ min: 1, max: 6 })),
    waterSource: faker.helpers.arrayElement([
      "Mains supply",
      "Water tank",
      "Bottled water",
    ]),
    handwashing: "Portable station with soap and paper towels",
    wasteDisposal: "Bagged and collected daily",
  };
}

/**
 * Fill the address-lookup (geocoder) field: type the query, wait for the
 * suggestion list, pick the first match, then assert the hidden coordinates
 * field filled — that value is what the catchment router resolves the serving
 * polyclinic from, so an empty one is a real failure, not a soft skip.
 */
export async function fillGeocodedEventAddress(
  page: Page,
  stepId: string,
  query: string,
): Promise<string> {
  const combo = page.getByRole("combobox", { name: "Event address line 1" });
  await combo.click();
  // pressSequentially (not fill) so the debounced autocomplete actually fires.
  await combo.pressSequentially(query, { delay: 20 });

  const firstSuggestion = page.getByRole("option").first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${query}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinates = page.locator(
    `input[id="${stepId}_event-address-coordinates"]`,
  );
  await expect(
    coordinates,
    "geocoder did not populate the hidden event coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
  const previewToken = process.env.PREVIEW_TOKEN;
  const landing = previewToken
    ? `/forms/${FORM_ID}?preview=${encodeURIComponent(previewToken)}`
    : `/forms/${FORM_ID}`;
  await page.goto(landing);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/** Steps 1–3, identical on both branches apart from the gate answer. */
export async function fillGateApplicantAndEvent(
  page: Page,
  data: ReturnType<typeof buildData>,
  operating: "yes" | "no",
): Promise<void> {
  let step = expectStep(page, "operating-restaurant");
  await selectRadio(page, step, "operating-restaurant", operating);
  await advance(page, step);

  step = expectStep(page, "applicant-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(page, step, "applicant-address-line-1", data.addressLine1);
  await selectDropdown(page, step, "applicant-parish", data.applicantParish);
  await fillField(page, step, "mobile-number", data.mobile);
  await fillField(page, step, "email", data.applicantEmail);
  await advance(page, step);

  step = expectStep(page, "event-details");
  await expect(page.locator("h1")).toContainText("About the event");
  await fillField(page, step, "event-name", data.eventName);
  await fillGeocodedEventAddress(page, step, data.eventAddress);
  await fillDate(
    page,
    step,
    "event-from",
    data.start.getDate(),
    data.start.getMonth() + 1,
    data.start.getFullYear(),
  );
  await fillDate(
    page,
    step,
    "event-to",
    data.end.getDate(),
    data.end.getMonth() + 1,
    data.end.getFullYear(),
  );
  await fillField(page, step, "event-start-time", data.startTime);
  await fillField(page, step, "event-end-time", data.endTime);
  await fillField(page, step, "num-patrons", data.numPatrons);
  await fillField(page, step, "num-stalls", data.numStalls);
  await advance(page, step);
}

test.describe("Request an Environmental Health Officer — Live Smoke", () => {
  test("submits the serving-food branch end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillGateApplicantAndEvent(page, data, "yes");

    // ─── Food and drink (checkbox-accordion) ─────────────────────────────────
    let step = expectStep(page, "food-details");
    await page.getByRole("checkbox", { name: RICE_GROUP_LABEL }).click();
    const leaf = page.getByRole("checkbox", {
      name: data.foodItem,
      exact: true,
    });
    await expect(leaf).toBeVisible({ timeout: STEP_TIMEOUT });
    await leaf.check();

    // "Other food" is a single-option group: one plain checkbox, no expander.
    await page
      .getByRole("checkbox", { name: OTHER_LABEL, exact: true })
      .check();
    await fillField(page, step, "other-food-description", data.otherFood);

    // food-source gates the supplier textarea: absent until the box is ticked.
    const supplierDetails = page.locator(`[id="${step}_supplier-details"]`);
    await expect(supplierDetails).toBeHidden();
    await page.locator(`input[id="${step}_food-source-supplier"]`).check();
    await expect(supplierDetails).toBeVisible({ timeout: STEP_TIMEOUT });
    await fillField(page, step, "supplier-details", data.supplierDetails);
    await advance(page, step);

    // ─── Food safety ─────────────────────────────────────────────────────────
    step = expectStep(page, "food-safety");
    await selectRadio(page, step, "has-food-licence", "no");
    await fillField(page, step, "handlers-male", data.handlersMale);
    await fillField(page, step, "handlers-female", data.handlersFemale);
    await fillField(page, step, "water-source", data.waterSource);
    await fillField(page, step, "handwashing", data.handwashing);
    await fillField(page, step, "waste-disposal", data.wasteDisposal);
    await advance(page, step);

    // ─── Supporting documents (three required on this branch) ────────────────
    step = expectStep(page, "documents");
    await uploadOne(page, step, "vendor-list", {
      name: "vendor-list.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await uploadOne(page, step, "site-plan", {
      name: "site-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await uploadOne(page, step, "medical-certs", {
      name: "medical-cert.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.eventName).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    // ─── Declaration: three boxes on this branch ─────────────────────────────
    expectStep(page, "declaration");
    await page
      .getByRole("checkbox", {
        name: /I confirm that my information is correct/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: /Health Services \(Restaurants\) Regulations, 1969/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: /responsible for the overtime costs/,
      })
      .check();

    await submitAndConfirm(page, {
      heading: "Request submitted",
      referenceLabel: "Submission ID",
    });

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
```

- [ ] **Step 2: Prove the file compiles and its imports resolve**

Be aware of what does and does not gate this file. `apps/forms/tsconfig.json` sets `"include": ["src/**/*.ts", …]` — `e2e/` is **outside it**, so no `tsc` run in this repo typechecks smoke specs, and Playwright's transform strips types without checking them. There is no type-check gate here; the guard is that the file loads. Keep the spec structurally close to the licence one and rely on the `--list` step below.

```bash
pnpm exec nx run forms:build
```

Expected: PASS (this builds `src`, confirming nothing about the spec was broken elsewhere).

- [ ] **Step 3: List the test without running it, to prove Playwright loads the file**

This is the real compile gate: Playwright imports the module, so a syntax error, a bad import path or a missing helper export fails here.

```bash
SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb \
  pnpm --filter @govtech-bb/forms exec playwright test \
  --config playwright.smoke.config.ts \
  request-an-environmental-health-officer --list
```

Expected: one test listed, named "submits the serving-food branch end-to-end and reaches the confirmation screen".

- [ ] **Step 4: Commit**

```bash
git add apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts
git commit -m "test(forms): add a live smoke for the officer request serving-food branch

On-demand only, like every spec under e2e/smoke. Needs PREVIEW_TOKEN while
the recipe is draft, since a non-public recipe 404s without one."
```

---

### Task 8: Live smoke — the officer-only branch proves the gate skips

The one assertion that cannot be made anywhere else: answering "no" removes the food steps from the journey entirely.

**Files:**
- Modify: `apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts`

**Interfaces:**
- Consumes: `buildData()`, `openForm()`, `fillGateApplicantAndEvent()` and `FORM_ID` from Task 7.
- Produces: nothing.

- [ ] **Step 1: Correct the file header's `SMOKE_BASE_URL` line**

Task 7 transcribed this line from the plan, which had copied it from the sibling smoke spec — and it is **wrong in both**. `playwright.smoke.config.ts:25-28` requires `SMOKE_BASE_URL` and throws without it; there is no default. An engineer following the header as written gets a config-load crash, not a sandbox run. Fix it in the new file.

Replace this line:

```
 *   SMOKE_BASE_URL   target environment (default https://forms.sandbox.alpha.gov.bb)
```

with:

```
 *   SMOKE_BASE_URL   target environment. REQUIRED — playwright.smoke.config.ts throws
 *                    without it, deliberately, so a real submission can never go to an
 *                    unintended environment by default. Use
 *                    https://forms.sandbox.alpha.gov.bb for sandbox.
```

And in the "Run them on demand" example just above it, add the variable so the command actually works as written:

```
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb PREVIEW_TOKEN=… \
 *     pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts request-an-environmental-health-officer
```

Leave the sibling spec `apply-for-temporary-restaurant-licence.smoke.spec.ts` alone — it carries the same inaccuracy, but it is outside this plan's scope.

- [ ] **Step 2: Add `currentStep` to the helper import**

This test needs one helper the first test did not. In the `from "../helpers/smoke"` import block, add `currentStep` between `advance` and `expectStep`, keeping the list alphabetical:

```typescript
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
```

- [ ] **Step 3: Add the second test**

Inside the existing `test.describe(...)` block in `apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts`, add this test after the first one:

```typescript
  test("skips the food steps and submits when not operating a temporary restaurant", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillGateApplicantAndEvent(page, data, "no");

    // The gate's whole purpose: food-details and food-safety are absent from the
    // journey, so leaving event-details lands directly on documents.
    const afterEvent = currentStep(page);
    expect(
      afterEvent,
      "answering no to operating-restaurant must skip food-details",
    ).not.toContain("food-details");
    expect(
      afterEvent,
      "answering no to operating-restaurant must skip food-safety",
    ).not.toContain("food-safety");

    // ─── Supporting documents (only two required on this branch) ─────────────
    let step = expectStep(page, "documents");
    await uploadOne(page, step, "vendor-list", {
      name: "vendor-list.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await uploadOne(page, step, "site-plan", {
      name: "site-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    // The medical certificate and food licence are gated on the yes branch, so
    // neither should be on the page at all here.
    await expect(page.locator(`input[id="${step}_medical-certs"]`)).toBeHidden();
    await expect(page.locator(`input[id="${step}_food-licence"]`)).toBeHidden();
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The skipped steps must not appear in the review either.
    await expect(page.getByText("Water source")).toHaveCount(0);
    await advance(page, step);

    // ─── Declaration: only two boxes on this branch ──────────────────────────
    expectStep(page, "declaration");
    await expect(
      page.getByRole("checkbox", {
        name: /Health Services \(Restaurants\) Regulations, 1969/,
      }),
    ).toBeHidden();
    await page
      .getByRole("checkbox", {
        name: /I confirm that my information is correct/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: /responsible for the overtime costs/,
      })
      .check();

    await submitAndConfirm(page, {
      heading: "Request submitted",
      referenceLabel: "Submission ID",
    });

    if (process.env.SMOKE_HOLD) await page.pause();
  });
```

- [ ] **Step 4: Confirm both tests are discovered**

```bash
SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb \
  pnpm --filter @govtech-bb/forms exec playwright test \
  --config playwright.smoke.config.ts \
  request-an-environmental-health-officer --list
```

Expected: two tests listed. A failure here means the module did not load — most likely the `currentStep` import from Step 2 was missed.

- [ ] **Step 5: Commit**

```bash
git add apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts
git commit -m "test(forms): smoke the officer-only branch of the request form

Asserts the stepConditionalOn gate actually removes food-details and
food-safety from the journey, that the two conditional uploads and the
1969-regulations declaration are absent, and that the shorter journey still
submits."
```

---

## Final verification

Run these from the repo root after Task 8. Everything here is what CI runs.

- [ ] **Full build (excluding `landing`, whose prebuild needs a live external API)**

```bash
pnpm exec nx run-many -t build --exclude=landing
```

Expected: PASS.

- [ ] **Full test suite**

```bash
pnpm exec nx run-many -t test --exclude=api
(cd apps/api && DB_HOST= pnpm exec vitest run)
```

Expected: both PASS. `api` is run separately with `DB_HOST=` blanked for the reason given in the Global Constraints — under plain `nx run-many -t test` it reports 7 failed migration-smoke *files* purely because no local Postgres is running, which masks whether anything real broke. Expected `api` totals: `Tests 1276 passed | 9 skipped` plus whatever Task 3 added.

- [ ] **Both recipe gates and the generated-drift gate**

```bash
pnpm validate-recipes
pnpm generate:services-index && git diff --exit-code apps/api/src/content/services-index.generated.ts
```

Expected: PASS, and the drift check produces no output.

- [ ] **Confirm the blast radius is exactly six files**

```bash
git diff --stat main...HEAD
```

Expected, and nothing else:

```
apps/api/src/content/services-index.generated.ts
apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json
apps/api/src/forms/form-definitions/request-an-environmental-health-officer.spec.ts
apps/forms/e2e/smoke/request-an-environmental-health-officer.smoke.spec.ts
apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md
apps/landing/src/content/request-an-environmental-health-officer/index.md
```

Plus the two design/plan docs. If `packages/` or the licence recipe appear, something went outside scope — stop and report. `apps/forms/src/routeTree.gen.ts` will show as *unstaged* in `git status` throughout: that is the pre-existing modification named in the Global Constraints, and it must never appear in `git diff main...HEAD`.

- [ ] **Rebase on `main` once PR #2242 has merged**

```bash
git fetch origin main
git rebase origin/main
```

Expected: no conflicts. #2242 only deletes `apply-for-temporary-restaurant-licence/start.md`; this branch never touches that file.

- [ ] **Manual walk, per the design spec's §9.3** — optional if the two smoke tests were actually run against a deployed environment, since they cover the same ground. Point `apps/forms` at a local API and check: the 14-day error fires on an event start under 14 days away, and the confirmation names the polyclinic matching the geocoded address.

## Handover notes

Two things the delivery team must do outside this branch:

1. **The recipe's `programmeCode` is dead and submissions will be mis-filed.** The recipe declares `"programmeCode": "ENV_HEALTH_OFFICER_REQUEST"`, but `apps/api/src/forms/submissions/processors/webhook.processor.ts` passes `payload.resolvedCatchment?.programmeCode` as `programmeCodeOverride`, and `apps/api/src/forms/submissions/processors/webhook-mapping.ts` resolves `programme_code: programmeCodeOverride ?? mapping.programmeCode` — the override always wins whenever a `catchmentRouting` block is present, which this recipe carries. The codes it resolves to, in `apps/api/src/catchment/polyclinic-routing.ts` (`PROGRAMME_CODES`), are all licence-specific (e.g. `TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT`). Every officer request would therefore reach the CMS tagged as a temporary restaurant licence application, indistinguishable from a real one. This needs an `apps/api` fix (per-form catchment programme codes, or an opt-out) before the form goes live; it is out of this branch's scope. Separately, webhook destinations resolve per-MDA by ministry key, not by programme code, so there is no `ENV_HEALTH_OFFICER_REQUEST` destination to provision — see [docs/webhook-destinations.md](../../webhook-destinations.md).
2. **Publish when MOH signs off, and only after item 1 above is resolved** — flip the recipe's `meta.visibility` to `public` and the content page's `visibility` to `public`. Only then does the Start button render. If the form is made public, it must also be added to the `deploy-sandbox.yml` post-deploy smoke matrix, which lists **only** `visibility: public` forms — a private form in that matrix 404s and breaks the gate.
