import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { createEditorApi, type ServiceSummary } from "../../src/api/client";
import { servicesQuery } from "../../src/api/queries";
import { ServicesList } from "../../src/workspace/services-list";

const service = (n: number): ServiceSummary => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  url: `/business-trade/service-${n}`,
  title: `Service ${String(n).padStart(2, "0")}`,
  category: { slug: "business-trade", title: "Business and trade" },
  visibility: n % 2 ? "preview" : "public",
  form_id: n === 1 ? "service-one" : null,
  has_start_page: n === 1,
  page_count: n === 1 ? 2 : 1,
  updated_at: "2026-10-06T12:00:00.000Z",
});

test("lists API services sorted by title, a page at a time, linked to landing", () => {
  const api = createEditorApi("http://localhost:3020", "https://alpha.gov.bb");
  const client = new QueryClient();
  client.setQueryData(
    servicesQuery(api).queryKey,
    Array.from({ length: 30 }, (_, i) => service(30 - i)),
  );

  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ServicesList api={api} />
    </QueryClientProvider>,
  );

  const titles = [...html.matchAll(/>(Service \d\d)</g)].map(([, title]) => title);
  expect(titles).toHaveLength(25);
  expect(titles.slice(0, 3)).toEqual(["Service 01", "Service 02", "Service 03"]);
  expect(html).toContain("1–25 of 30");
  expect(html).toContain("30 services");
  expect(html).toContain('href="https://alpha.gov.bb/business-trade/service-1"');
  expect(html).toContain("Preview link only");
  expect(html).toContain("with start");
  expect(html).toContain("Draft link only");
  expect(html).toContain('aria-sort="ascending"');
});
