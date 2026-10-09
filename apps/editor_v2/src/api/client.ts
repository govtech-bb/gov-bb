import type { paths } from "./openapi";

type Json<Content> = Content extends { content: { "application/json": infer Body } } ? Body : never;

/** A page as the editor reads and saves it. */
export type ApiPage = Json<paths["/pages/{id}"]["get"]["responses"][200]>;

/** What creating a page sends. */
export type NewPage = Json<paths["/pages"]["post"]["requestBody"]>;

/** What saving a page sends: every field, with `parent_id` left out to keep the parent. */
export type SaveFields = Json<paths["/pages/{id}"]["put"]["requestBody"]>;

/** One row of the services list. */
export type ServiceSummary = Json<paths["/services"]["get"]["responses"][200]>[number];

/** A service opened in the editor: its summary and every page in it. */
export type ServiceDetail = Json<paths["/services/{id}"]["get"]["responses"][200]>;

/** A page of an opened service. */
export type ServicePage = ServiceDetail["pages"][number];

/** A category a page can be filed under. */
export type TaxonomyCategory = Json<
  paths["/taxonomy"]["get"]["responses"][200]
>["categories"][number];

/** One entry in a page's history. */
export type PageVersion = Json<
  paths["/pages/{id}/history"]["get"]["responses"][200]
>["versions"][number];

/** A page as one change left it. */
export type PageSnapshot = Json<paths["/pages/{id}/history/{version}"]["get"]["responses"][200]>;

/** The estate's change token. */
export type EstateVersion = Json<paths["/version"]["get"]["responses"][200]>;

/** A field the API refused, and what the editor can do about it. */
export type FieldError = Json<paths["/pages"]["post"]["responses"][422]>["errors"][number];

type FailureBody = { message?: string; errors?: FieldError[] };

/** A request the API refused or never answered: status 0 means it was not reached. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly FieldError[] = [],
    message = status === 0 ? "The content API could not be reached" : `HTTP ${status}`,
  ) {
    super(message);
  }
}

export type EditorApi = ReturnType<typeof createEditorApi>;

/** api_v2's editor routes, sent with the employee session cookie. */
export function createEditorApi(apiOrigin: string, landingOrigin?: string) {
  const landing = landingOrigin ? new URL(landingOrigin).origin : undefined;

  async function send(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: NewPage | SaveFields,
    ifUpdatedAt?: string,
  ) {
    const headers = new Headers();

    const init: RequestInit = { method, headers, credentials: "include", cache: "no-store" };

    // Fastify refuses a JSON content type on a request with no body.
    if (body) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }

    if (ifUpdatedAt) headers.set("if-updated-at", ifUpdatedAt);

    let response: Response;

    try {
      response = await fetch(`${apiOrigin}${path}`, init);
    } catch {
      throw new ApiFailure(0);
    }

    if (response.ok) return response;
    const failure: FailureBody | null = await response.json().catch(() => null);
    throw new ApiFailure(response.status, failure?.errors, failure?.message);
  }

  const read = async <Body>(path: string): Promise<Body> => (await send("GET", path)).json();

  return {
    services: () => read<ServiceSummary[]>("/services"),
    service: (id: string) => read<ServiceDetail>(`/services/${id}`),
    taxonomy: async () => (await read<{ categories: TaxonomyCategory[] }>("/taxonomy")).categories,
    version: () => read<EstateVersion>("/version"),
    page: (id: string) => read<ApiPage>(`/pages/${id}`),
    history: async (id: string) =>
      (await read<{ versions: PageVersion[] }>(`/pages/${id}/history`)).versions,
    pageVersion: (id: string, version: number) =>
      read<PageSnapshot>(`/pages/${id}/history/${version}`),
    createPage: async (page: NewPage): Promise<ApiPage> =>
      (await send("POST", "/pages", page)).json(),
    savePage: async (id: string, fields: SaveFields, ifUpdatedAt: string): Promise<ApiPage> =>
      (await send("PUT", `/pages/${id}`, fields, ifUpdatedAt)).json(),
    deletePage: async (id: string, ifUpdatedAt?: string) => {
      await send("DELETE", `/pages/${id}`, undefined, ifUpdatedAt);
    },
    landingUrl: (path: string) => (landing ? `${landing}${path}` : undefined),
  };
}
