import {
  categoriesFrom,
  categoryProblems,
  categoryUrl,
  deleteBlocker,
  movedOrder,
  reordered,
  siblingsOf,
  withServiceCounts,
  type Category,
  type CategoryFields,
} from "./categories";
import type { paths } from "./openapi";

type Json<Content> = Content extends { content: { "application/json": infer Body } } ? Body : never;

/** A page as the editor reads and saves it. */
export type ApiPage = Json<paths["/pages/{id}"]["get"]["responses"][200]>;

/** What creating a page sends. */
export type CreatePageInput = Json<paths["/pages"]["post"]["requestBody"]>;

/** What saving a page sends: every field, with `parent_id` left out to keep the parent. */
export type SavePageInput = Json<paths["/pages/{id}"]["put"]["requestBody"]>;

/** One row of the services list. */
export type ServiceSummary = Json<paths["/services"]["get"]["responses"][200]>[number];

/** A service opened in the editor: its summary and every page in it. */
export type ServiceDetail = Json<paths["/services/{id}"]["get"]["responses"][200]>;

/** A page of an opened service. */
export type ServicePage = ServiceDetail["pages"][number];

/** A category as the content API has it saved: what a page's `category_id` can name. */
export type SavedCategory = Json<
  paths["/editor/categories"]["get"]["responses"][200]
>["categories"][number];

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
    body?: CreatePageInput | SavePageInput,
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

  const services = () => read<ServiceSummary[]>("/services");

  // Page pickers offer these; the preview starts from them, and its edits never reach them
  const savedCategories = async () =>
    (await read<{ categories: SavedCategory[] }>("/editor/categories")).categories;

  return {
    services,
    service: (id: string) => read<ServiceDetail>(`/services/${id}`),
    savedCategories,
    ...categoryShell(savedCategories, services),
    version: () => read<EstateVersion>("/version"),
    page: (id: string) => read<ApiPage>(`/pages/${id}`),
    createPage: async (page: CreatePageInput): Promise<ApiPage> =>
      (await send("POST", "/pages", page)).json(),
    savePage: async (id: string, fields: SavePageInput, ifUpdatedAt: string): Promise<ApiPage> =>
      (await send("PUT", `/pages/${id}`, fields, ifUpdatedAt)).json(),
    deletePage: async (id: string) => {
      await send("DELETE", `/pages/${id}`);
    },
    landingUrl: (path: string) => (landing ? `${landing}${path}` : undefined),
  };
}

/**
 * Local category preview seeded from the saved categories, with fresh service counts on each read.
 * Changes never reach page pickers or the API: the editor does not send category writes yet.
 */
function categoryShell(
  savedCategories: () => Promise<SavedCategory[]>,
  services: () => Promise<ServiceSummary[]>,
) {
  let kept: Category[] = [];
  let loading: Promise<void> | undefined;
  // The category each slug named when the list loaded: services name theirs by slug
  let ids: ReadonlyMap<string, string> = new Map();

  // The first read loads the list; a failed one is asked again next time
  const load = async () => {
    loading ??= savedCategories().then((entries) => {
      ids = new Map(entries.map((entry) => [entry.slug, entry.id]));
      kept = categoriesFrom(entries);
    });

    try {
      await loading;
    } catch (error) {
      loading = undefined;
      throw error;
    }
  };

  const find = (categories: readonly Category[], id: string) => {
    const category = categories.find((item) => item.id === id);

    if (!category) throw new ApiFailure(404);

    return category;
  };

  const checked = (fields: CategoryFields, categories: readonly Category[], id?: string) => {
    const problems = categoryProblems(fields, categories, id);

    if (problems.length > 0) throw new ApiFailure(422, problems);
    const parent = categories.find((item) => item.id === fields.parent_id);

    return {
      title: fields.title.trim(),
      slug: fields.slug,
      parent_id: parent?.id ?? null,
      description: fields.description.trim(),
      url: categoryUrl(fields.slug, parent),
    };
  };

  // With the services filed under each one now, so a count is never older than the services list
  const counted = async () => {
    await load();
    const listed = await services();

    return withServiceCounts(kept, listed, ids);
  };

  // After the last of its new siblings
  const endOf = (categories: readonly Category[], parentId: string | null) =>
    Math.max(-1, ...siblingsOf(categories, parentId).map((item) => item.position)) + 1;

  return {
    categories: counted,
    createCategory: async (fields: CategoryFields): Promise<Category> => {
      await load();
      const categories = kept;
      const values = checked(fields, categories);

      const created = {
        ...values,
        id: crypto.randomUUID(),
        position: endOf(categories, values.parent_id),
        services: 0,
        serviceCategoryTitle: values.title,
      };

      kept = [...categories, created];

      return created;
    },
    updateCategory: async (id: string, fields: CategoryFields): Promise<Category> => {
      await load();
      const categories = kept;
      const old = find(categories, id);
      const values = checked(fields, categories, id);

      const updated = {
        ...old,
        ...values,
        position:
          values.parent_id === old.parent_id ? old.position : endOf(categories, values.parent_id),
      };

      // A subcategory's address starts with its parent's slug
      kept = categories.map((item) =>
        item.id === id
          ? updated
          : item.parent_id === id
            ? { ...item, url: categoryUrl(item.slug, updated) }
            : item,
      );

      return updated;
    },
    moveCategory: async (id: string, by: -1 | 1) => {
      await load();
      const ids = movedOrder(kept, id, by);

      kept = reordered(kept, ids);

      return ids;
    },
    deleteCategory: async (id: string) => {
      const categories = await counted();
      const blocked = deleteBlocker(find(categories, id), kept);

      if (blocked) throw new ApiFailure(409, [], blocked);
      kept = kept.filter((item) => item.id !== id);
    },
  };
}
