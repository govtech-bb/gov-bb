/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ServiceDetail } from "../../src/api/client";
import type { DraftStorage } from "../../src/persistence/types";
import { openDocument } from "../../src/workspace/documents";
import { documentKeys, type PageDocument } from "../../src/workspace/model";
import { useScreenPlace } from "../../src/workspace/screen-place";
import { ScreenTitle, screenTitle } from "../../src/workspace/screen-title";
import { pageDocumentFromApi } from "../../src/workspace/service-pages";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The editor's own name, as the route's head gives it
  document.head.innerHTML = "<title>GovBB editor</title>";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

test("a tab is named for its screen, the most specific name first", () => {
  expect(screenTitle("Entry page", "Renew a passport")).toBe(
    "Entry page – Renew a passport – GovBB editor",
  );
  expect(screenTitle("Services")).toBe("Services – GovBB editor");
  // While the service is still loading, the tab keeps the editor's name
  expect(screenTitle(undefined, undefined)).toBe("GovBB editor");
});

test("a screen's title takes the tab over from the editor's name, and gives it back", async () => {
  await render(<ScreenTitle names={["Services"]} />);
  expect(document.title).toBe("Services – GovBB editor");

  await render(<ScreenTitle names={["Entry page", "Renew a passport"]} />);
  expect(document.title).toBe("Entry page – Renew a passport – GovBB editor");

  await render(null);
  expect(document.title).toBe("GovBB editor");
});

function Place(props: Parameters<typeof useScreenPlace>[0] & { remote?: ServiceDetail }) {
  const { remote, ...local } = props;
  const remoteDocument = remote && pageDocumentFromApi(remote.pages[0]!);
  const place = useScreenPlace(local, { service: remote, document: remoteDocument });

  return <p>{`${place.document} | ${place.service}`}</p>;
}

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

test("the place names a browser draft's page as it's typed, and an API page as the sidebar does", async () => {
  const storage = memoryStorage();
  const keys = documentKeys("fees");
  storage.setItem(keys.committed, "---\ntitle: Fees\n---\n\nWhat it costs.\n");

  const fees: PageDocument = { id: "fees", title: "Fees", kind: "page", role: "supporting", keys };
  const store = openDocument(fees, storage);
  const service = { id: "passports", title: "Passport renewals", documents: [fees] };

  await render(<Place service={service} document={fees} store={store} />);
  expect(host.textContent).toBe("Fees | Passport renewals");

  await act(async () => {
    store.edit("---\ntitle: Fees and payment\n---\n\nWhat it costs.\n");
    store.apply();
  });
  expect(host.textContent).toBe("Fees and payment | Passport renewals");

  const remote: ServiceDetail = {
    service: {
      id: "s1",
      url: "/business-trade/apply-for-hotel-licence",
      title: "Apply for a hotel licence",
      category: { slug: "business-trade", title: "Business and trade" },
      visibility: "public",
      form_id: null,
      has_start_page: false,
      page_count: 1,
      updated_at: "2026-10-07T12:00:00.000Z",
    },
    pages: [
      {
        id: "s1",
        parent_id: null,
        role: "entry",
        url: "/business-trade/apply-for-hotel-licence",
        slug: "apply-for-hotel-licence",
        title: "Apply for a hotel licence",
        visibility: "public",
        form_id: null,
        updated_at: "2026-10-07T12:00:00.000Z",
      },
    ],
  };

  await render(<Place remote={remote} />);
  expect(host.textContent).toBe("Entry page | Apply for a hotel licence");
});
