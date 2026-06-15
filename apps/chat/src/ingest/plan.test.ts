import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PlannedChunk,
  PlannedDocument,
  PlannedEntity,
} from "./chunker.ts";
import {
  planIngest,
  summarise,
  withoutPruning,
  type ExistingState,
} from "./plan.ts";

const MODEL = "amazon.titan-embed-text-v2:0";

function doc(id: string, payloadHash: string): PlannedDocument {
  return {
    id,
    kind: "service",
    slug: id,
    title: id,
    url: `/${id}`,
    metadata: {},
    payloadHash,
  };
}

function chunk(
  id: string,
  documentId: string,
  embedHash: string,
): PlannedChunk {
  return {
    id,
    documentId,
    kind: "section",
    chunkIndex: 0,
    text: id,
    embedHash,
  };
}

function entity(d: PlannedDocument, chunks: PlannedChunk[]): PlannedEntity {
  return { document: d, chunks };
}

test("classifies documents into new / changed / unchanged / orphan", () => {
  const planned = [
    entity(doc("d-new", "h1"), []),
    entity(doc("d-changed", "h-new"), []),
    entity(doc("d-same", "h-same"), []),
  ];
  const existing: ExistingState = {
    documents: [
      { id: "d-changed", payloadHash: "h-old", embeddingModel: MODEL },
      { id: "d-same", payloadHash: "h-same", embeddingModel: MODEL },
      { id: "d-gone", payloadHash: "x", embeddingModel: MODEL },
    ],
    chunks: [],
  };
  const plan = planIngest(planned, existing, MODEL);
  assert.deepEqual(
    plan.documents.new.map((d) => d.id),
    ["d-new"],
  );
  assert.deepEqual(
    plan.documents.changed.map((d) => d.id),
    ["d-changed"],
  );
  assert.deepEqual(
    plan.documents.unchanged.map((d) => d.id),
    ["d-same"],
  );
  assert.deepEqual(plan.documents.orphans, ["d-gone"]);
});

test("an embedding-model change marks an otherwise-unchanged doc as changed", () => {
  const planned = [entity(doc("d1", "h"), [])];
  const existing: ExistingState = {
    documents: [{ id: "d1", payloadHash: "h", embeddingModel: "old-model" }],
    chunks: [],
  };
  const plan = planIngest(planned, existing, MODEL);
  assert.deepEqual(
    plan.documents.changed.map((d) => d.id),
    ["d1"],
  );
});

test("classifies chunks into new / reEmbed / unchanged", () => {
  const planned = [
    entity(doc("d1", "h"), [
      chunk("c-new", "d1", "e1"),
      chunk("c-reembed", "d1", "e-new"),
      chunk("c-same", "d1", "e-same"),
    ]),
  ];
  const existing: ExistingState = {
    documents: [{ id: "d1", payloadHash: "h", embeddingModel: MODEL }],
    chunks: [
      { id: "c-reembed", documentId: "d1", embedHash: "e-old" },
      { id: "c-same", documentId: "d1", embedHash: "e-same" },
    ],
  };
  const plan = planIngest(planned, existing, MODEL);
  assert.deepEqual(
    plan.chunks.new.map((c) => c.id),
    ["c-new"],
  );
  assert.deepEqual(
    plan.chunks.reEmbed.map((c) => c.id),
    ["c-reembed"],
  );
  assert.deepEqual(
    plan.chunks.unchanged.map((c) => c.id),
    ["c-same"],
  );
  assert.equal(summarise(plan).bedrockCalls, 2); // new + reEmbed
});

test("only lists orphan chunks whose parent doc is staying (cascade dedupe)", () => {
  // d1 stays (in plan); d2 is an orphan (absent from plan).
  const planned = [entity(doc("d1", "h"), [chunk("c-keep", "d1", "e")])];
  const existing: ExistingState = {
    documents: [
      { id: "d1", payloadHash: "h", embeddingModel: MODEL },
      { id: "d2", payloadHash: "h", embeddingModel: MODEL },
    ],
    chunks: [
      { id: "c-keep", documentId: "d1", embedHash: "e" },
      { id: "c-gone-d1", documentId: "d1", embedHash: "e" }, // parent stays → listed
      { id: "c-gone-d2", documentId: "d2", embedHash: "e" }, // parent orphaned → cascades, not listed
    ],
  };
  const plan = planIngest(planned, existing, MODEL);
  assert.deepEqual(plan.documents.orphans, ["d2"]);
  assert.deepEqual(plan.chunks.orphans, ["c-gone-d1"]);
});

test("withoutPruning clears both orphan lists, leaving the rest intact", () => {
  const planned = [entity(doc("d-new", "h"), [chunk("c-new", "d-new", "e")])];
  const existing: ExistingState = {
    documents: [{ id: "d-old", payloadHash: "h", embeddingModel: MODEL }],
    chunks: [{ id: "c-old", documentId: "d-old", embedHash: "e" }],
  };
  const plan = withoutPruning(planIngest(planned, existing, MODEL));
  assert.deepEqual(plan.documents.orphans, []);
  assert.deepEqual(plan.chunks.orphans, []);
  assert.deepEqual(
    plan.documents.new.map((d) => d.id),
    ["d-new"],
  );
  assert.deepEqual(
    plan.chunks.new.map((c) => c.id),
    ["c-new"],
  );
});
