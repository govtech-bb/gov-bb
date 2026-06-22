import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageTransport } from "./local-storage";
import type { Thread } from "../types";

function makeThread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    pageId: "/page",
    selector: "#main",
    quote: "",
    prefix: "",
    suffix: "",
    author: "Jane",
    text: "Looks good",
    createdAt: 1,
    resolved: false,
    replies: [],
    ...over,
  };
}

describe("LocalStorageTransport", () => {
  let store: LocalStorageTransport;

  beforeEach(() => {
    localStorage.clear();
    store = new LocalStorageTransport();
  });

  it("starts empty for an unknown page", async () => {
    expect(await store.list("/page")).toEqual([]);
  });

  it("creates and lists threads scoped per page", async () => {
    await store.create(makeThread());
    await store.create(makeThread({ id: "t2", pageId: "/other" }));

    const page = await store.list("/page");
    expect(page).toHaveLength(1);
    expect(page[0]!.id).toBe("t1");
    expect(await store.list("/other")).toHaveLength(1);
  });

  it("listAll returns threads from every page", async () => {
    await store.create(makeThread());
    await store.create(makeThread({ id: "t2", pageId: "/other" }));
    const all = await store.listAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("appends replies to the right thread", async () => {
    await store.create(makeThread());
    await store.reply("t1", {
      id: "r1",
      author: "Sam",
      text: "agreed",
      createdAt: 2,
    });
    const [thread] = await store.list("/page");
    expect(thread!.replies).toHaveLength(1);
    expect(thread!.replies[0]!.text).toBe("agreed");
  });

  it("toggles resolved state", async () => {
    await store.create(makeThread());
    await store.setResolved("t1", true);
    expect((await store.list("/page"))[0]!.resolved).toBe(true);
    await store.setResolved("t1", false);
    expect((await store.list("/page"))[0]!.resolved).toBe(false);
  });

  it("survives corrupt stored JSON", async () => {
    localStorage.setItem("gtc:preview-comments:/page", "{not json");
    expect(await store.list("/page")).toEqual([]);
  });
});
