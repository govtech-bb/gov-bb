import assert from "node:assert/strict";
import { test } from "node:test";
import type { FormResolution, FormSession } from "./form";
import { buildSystemPrompts, type PromptTurnState } from "./prompt-builder";

function session(overrides: Partial<FormSession> = {}): FormSession {
  return {
    threadId: "t1",
    slug: null,
    handedOffSlug: null,
    values: {},
    askedFieldIds: new Set<string>(),
    reviewedSinceChange: false,
    submissionId: "s1",
    status: "collecting",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const collectResolution = (slug = "mail-redirect"): FormResolution =>
  ({
    kind: "collect",
    form: {
      slug,
      schema: `Form: Mail Redirect (${slug})\n\n- full-name: text (required)`,
      contract: { title: "Mail Redirect" },
      activeFieldIds: new Set(["full-name"]),
    },
  }) as unknown as FormResolution;

function build(overrides: Partial<PromptTurnState> = {}): string {
  const prompts = buildSystemPrompts({
    contextBlock: "(no context)",
    resolution: { kind: "none" },
    session: session(),
    formsUrl: "https://forms.test",
    ...overrides,
  });
  return prompts.map(String).join("\n===\n");
}

// Every turn carries the base system prompt + the turn context block.
test("always leads with the system prompt and context", () => {
  const text = build();
  assert.match(text, /Context for this turn:/);
});

test("handoff: apply-intent pushes the link, info-intent offers it", () => {
  const resolution: FormResolution = {
    kind: "handoff",
    slug: "x",
    title: "Conductor licence",
    url: "https://forms.test/forms/x",
  };
  const apply = build({ resolution, intent: "apply" });
  assert.match(apply, /https:\/\/forms\.test\/forms\/x/);
  const info = build({ resolution, intent: "info" });
  // The offer variant names the service but withholds the pushy link block.
  assert.match(info, /Conductor licence/);
  assert.notEqual(info, apply);
});

test("collect first-turn (apply): protocol + schema + start-collecting + form link", () => {
  const text = build({ resolution: collectResolution() });
  assert.match(text, /FORM COLLECTION:/);
  assert.match(text, /full-name: text \(required\)/);
  assert.match(text, /wants to apply and has not started/);
  assert.match(text, /https:\/\/forms\.test\/forms\/mail-redirect/);
});

test("collect offerOnly: answers first, offers choices, never collects", () => {
  const text = build({ resolution: collectResolution(), offerOnly: true });
  assert.match(text, /INFORMATION question/);
  assert.match(text, /Do NOT ask for any form field/);
});

test("collect mid-collection: already-collected block + side-question line", () => {
  const text = build({
    resolution: collectResolution(),
    session: session({ values: { "full-name": "Aaron" } }),
  });
  assert.match(text, /Already collected/);
  assert.match(text, /"Aaron"/);
  assert.match(text, /answer it briefly from the context above FIRST/);
});

test("collect: submitted and failed statuses surface their state lines", () => {
  const submitted = build({
    resolution: collectResolution(),
    session: session({ status: "submitted", referenceNumber: "MR-1" }),
  });
  assert.match(submitted, /Reference number: MR-1\. Do NOT submit again/);

  const failed = build({
    resolution: collectResolution(),
    session: session({ status: "failed", lastError: "bad value" }),
  });
  assert.match(failed, /Last submission attempt failed: bad value/);
});

test("collect: feedback form gets the feedback guidance attached", () => {
  const text = build({ resolution: collectResolution("chat-feedback") });
  assert.match(text, /OPTIONAL FEEDBACK FORM/);
});

test("handoff continuation keeps the link in front of the user", () => {
  const text = build({
    handoffContinuation: { title: "Conductor", url: "https://f.test/x" },
  });
  assert.match(text, /https:\/\/f\.test\/x/);
});

test("rag collect link offers the form link disclosure", () => {
  const text = build({
    ragCollectLink: { title: "Mail", url: "https://f.test/m" },
  });
  assert.match(text, /https:\/\/f\.test\/m/);
});

// Closers must NOT get the no-form disclosure (it would answer substance on a
// goodbye); the feedback invitation rides along only when still available.
test("closer routes to the sign-off guidance, with optional feedback offer", () => {
  const plain = build({ closer: true });
  assert.doesNotMatch(plain, /NO ONLINE FORM AVAILABLE/);
  const withOffer = build({ closer: true, offerFeedback: true });
  assert.notEqual(plain, withOffer);
});

// A retrieval miss routes to the guiding miss disclosure, not the no-form one
// (#1099 — NO_FORM_DISCLOSURE assumes there IS context to answer from).
test("noContext routes to the miss disclosure", () => {
  const text = build({ noContext: true });
  assert.match(text, /Retrieval found nothing solid/);
  assert.doesNotMatch(text, /NO ONLINE FORM AVAILABLE/);
});

test("default informational turn gets the no-form disclosure", () => {
  const text = build();
  assert.match(text, /NO ONLINE FORM AVAILABLE/);
});

// A published-but-unapproved form must get the honest disclosure: the form
// exists, the chat just can't offer it — never the no-form lie.
test("unapprovedForm routes to the honest disclosure, not the no-form one", () => {
  const text = build({ unapprovedForm: true });
  assert.match(text, /NOT AVAILABLE THROUGH THIS CHAT/);
  assert.match(text, /do NOT claim there is no online form/);
  assert.doesNotMatch(text, /NO ONLINE FORM AVAILABLE/);
});
