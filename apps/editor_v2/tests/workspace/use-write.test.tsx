/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  ApiFailure,
  createEditorApi,
  type EditorApi,
  type RecordDetail,
} from "../../src/api/client";
import { writes } from "../../src/api/writes";
import { useWrite } from "../../src/workspace/use-write";

afterEach(() => vi.unstubAllGlobals());

test.each(["landed", "unknown", "confirmed"])(
  "useWrite invalidates content for %s",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["content", "probe"], "cached");
    client.setQueryData(["other"], "cached");
    const read = Promise.withResolvers<RecordDetail>();

    const api = {
      ...createEditorApi("https://content.test"),
      deleteRecord: vi.fn<EditorApi["deleteRecord"]>().mockResolvedValue(undefined),
      record: vi.fn<EditorApi["record"]>().mockReturnValue(read.promise),
    };

    if (kind !== "landed") api.deleteRecord.mockRejectedValue(new ApiFailure(0));

    function Harness() {
      const write = useWrite(api, writes.deleteRecord);

      return (
        <button
          onClick={() =>
            void write.press(() => ({ collection: "contacts", key: "nis", version: 1 }))
          }
        >
          {write.state}:{write.outcome?.kind}
        </button>
      );
    }

    const host = document.createElement("div");
    const root = createRoot(host);

    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <Harness />
          </QueryClientProvider>,
        ),
      );
      await act(async () => host.querySelector("button")!.click());
      expect(client.getQueryState(["content", "probe"])?.isInvalidated).toBe(true);
      expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);

      if (kind !== "landed") {
        expect(host.textContent).toBe("checking:");
        client.setQueryData(["content", "probe"], "refreshed");
        await act(async () => read.reject(new ApiFailure(kind === "confirmed" ? 404 : 503)));
        expect(client.getQueryState(["content", "probe"])?.isInvalidated).toBe(
          kind === "confirmed",
        );
      }

      expect(host.textContent).toBe(kind === "unknown" ? "unsettled:unknown" : "idle:landed");
      expect(api.deleteRecord).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      client.clear();
    }
  },
);
