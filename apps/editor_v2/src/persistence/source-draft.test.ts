import { expect, test } from "vitest";
import { DraftStore } from "./draft-store";
import { govbbPageCodec } from "../presets/govbb-page";

const visual = "---\ntitle: Original\n---\n\nA paragraph.\n";

const sourceOnly = '---\ntitle: Exact source\n---\n\n<Custom thing="kept" />\n';

test("source-only pages Apply exact bytes without an invisible canvas", () => {
  const store = new DraftStore(sourceOnly, govbbPageCodec);
  expect(store.getSnapshot()).toMatchObject({ mode: "source", valid: true, state: undefined });
  const next = sourceOnly + "\n<!-- Keep this too -->\n";
  store.edit(next);
  expect(store.apply()).toBe(true);
  expect(store.getSnapshot()).toMatchObject({
    mode: "source",
    source: next,
    committed: next,
    dirty: false,
  });
});

test("source-only invalid YAML retains both working text and the last applied source", () => {
  const store = new DraftStore(sourceOnly, govbbPageCodec);
  const invalid = "---\ntitle: [invalid\n---\n\nExact unfinished bytes";
  store.edit(invalid);
  expect(store.apply()).toBe(false);
  expect(store.getSnapshot()).toMatchObject({
    source: invalid,
    committed: sourceOnly,
    dirty: true,
  });
  store.discard();
  expect(store.getSnapshot().source).toBe(sourceOnly);
});

test("visual/source mode changes ignore a stale canvas and prepare the next mount", () => {
  const store = new DraftStore(visual, govbbPageCodec);
  const old = store.getSnapshot().state!;
  store.edit(sourceOnly);
  expect(store.apply()).toBe(true);
  store.canvasChanged(old);
  expect(store.getSnapshot().committed).toBe(sourceOnly);
  store.edit(visual.replace("Original", "Returned"));
  expect(store.apply()).toBe(true);
  expect(store.getSnapshot().mode).toBe("visual");
  expect(govbbPageCodec.encode(store.getSnapshot().state!)).toContain("Returned");
});

test("initial original bytes survive unchanged canvas notifications", () => {
  const source = "---\ntitle: 'Original'\n---\n\nA paragraph.\n\n";
  const store = new DraftStore(source, govbbPageCodec);
  store.canvasChanged(store.getSnapshot().state!);
  expect(store.getSnapshot().source).toBe(source);
});
