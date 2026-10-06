import { queryOptions } from "@tanstack/react-query";

/** One row of api_v2's `GET /services`. */
export type ServiceSummary = {
  id: string;
  url: string;
  title: string;
  category: { slug: string; title: string };
  visibility: "public" | "preview" | "draft";
  form_id: string | null;
  has_start_page: boolean;
  page_count: number;
  updated_at: string;
};

export type EditorApi = ReturnType<typeof createEditorApi>;

/** Content reads from api_v2, sent with the employee session cookie. */
export function createEditorApi(apiOrigin: string, landingOrigin?: string) {
  const landing = landingOrigin ? new URL(landingOrigin).origin : undefined;

  return {
    async services(): Promise<ServiceSummary[]> {
      const response = await fetch(`${apiOrigin}/services`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) throw new Error(`GET /services failed: ${response.status}`);

      return response.json();
    },
    landingUrl: (path: string) => (landing ? `${landing}${path}` : undefined),
  };
}

export const servicesQuery = (api: EditorApi) =>
  queryOptions({ queryKey: ["services"], queryFn: () => api.services() });
