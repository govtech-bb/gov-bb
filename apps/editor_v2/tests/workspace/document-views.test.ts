import { expect, test } from "vitest";
import { DocumentSessions, keptViews } from "../../src/workspace/document-views";

const always = () => true;

test("the document on screen and the two before it keep their views; older ones close", () => {
  expect(keptViews([], "fees", always)).toEqual(["fees"]);
  expect(keptViews(["start", "entry"], "fees", always)).toEqual(["fees", "start", "entry"]);
  expect(keptViews(["fees", "start", "entry"], "refunds", always)).toEqual([
    "refunds",
    "fees",
    "start",
  ]);
  // Going back to one that's still mounted brings it to the front, closing nothing
  expect(keptViews(["refunds", "fees", "start"], "start", always)).toEqual([
    "start",
    "refunds",
    "fees",
  ]);
});

test("a view whose draft can't be left yet stays mounted beyond the few", () => {
  const unsaved = (id: string) => id !== "entry";

  expect(keptViews(["start", "fees", "entry"], "refunds", unsaved)).toEqual([
    "refunds",
    "start",
    "fees",
    "entry",
  ]);
});

test("a closed view's session waits for it, unless its draft changed while it was closed", () => {
  const sessions = new DocumentSessions();
  const fees = sessions.get("fees");

  expect(sessions.get("fees")).toBe(fees);

  // Closed and opened on the same draft: the same session
  sessions.close("fees", "Fees draft");
  sessions.open("fees", "Fees draft");
  expect(sessions.get("fees")).toBe(fees);

  // Opening a view that never closed changes nothing
  sessions.open("fees", "Changed in another tab");
  expect(sessions.get("fees")).toBe(fees);

  // Changed while closed, such as by another tab: a fresh session
  sessions.close("fees", "Fees draft");
  sessions.open("fees", "Changed in another tab");
  expect(sessions.get("fees")).not.toBe(fees);

  const start = sessions.get("start");
  sessions.forget("start");
  expect(sessions.get("start")).not.toBe(start);
});
