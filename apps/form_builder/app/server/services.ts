import { randomUUID, createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import matter from "gray-matter";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  serviceIdSchema,
  serviceManifestSchema,
  serviceSnapshotSchema,
  servicePageDraftSchema,
  draftRecipeSchema,
  servicePendingConfigSchema,
  serviceReadiness,
  type ServiceSnapshot,
  type ServiceManifest,
} from "@govtech-bb/form-types";
import { api, ApiError } from "./api-client";
import { requireSession } from "./auth/require-session";
import { resolveStoredRecipe } from "./forms";
import { loadLandingContentPage } from "./content";
import {
  redactRecipeSecrets,
  restoreRecipeSecrets,
  assertNoRedactedSecrets,
} from "./redact-processor-secrets";
import {
  authHeaders,
  repoUrl,
  ghError,
  getContents,
  openPullRequest,
  listOpenPRHeads,
} from "./github";
import { resolveBaseBranch, carryUnauthoredFields } from "./publish";
import { contentSlug, startPageUrl } from "../lib/content";

export const getServiceUser = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(({ context }) => context.session.login);
async function sourceSha(token: string, path: string): Promise<string | null> {
  if (import.meta.env.DEV && !token) {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    try {
      const raw = await readFile(resolve(process.cwd(), "../..", path));
      return createHash("sha1")
        .update(`blob ${raw.length}\0`)
        .update(raw)
        .digest("hex");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  const response = await getContents(token, path, resolveBaseBranch());
  if (response.status === 404) return null;
  if (!response.ok)
    throw await ghError(
      "Could not check the current published source",
      response,
    );
  return ((await response.json()) as { sha: string }).sha;
}

export const loadServiceSource = createServerFn({
  method: "POST",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(
    z.object({
      serviceId: serviceIdSchema,
      title: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      formId: serviceIdSchema.nullable().optional(),
      paths: z.array(servicePageDraftSchema.shape.path).max(100).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ServiceSnapshot> => {
    const token = context.session.accessToken;
    const manifestPath = `services/${data.serviceId}.json`;
    const baseManifestSha = await sourceSha(token, manifestPath);
    let savedManifest: ServiceManifest | null = null;
    if (baseManifestSha) {
      if (import.meta.env.DEV && !token) {
        const { readFile } = await import("node:fs/promises");
        const { resolve } = await import("node:path");
        savedManifest = serviceManifestSchema.parse(
          JSON.parse(
            await readFile(
              resolve(process.cwd(), "../..", manifestPath),
              "utf8",
            ),
          ),
        );
      } else {
        const response = await getContents(
          token,
          manifestPath,
          resolveBaseBranch(),
        );
        if (!response.ok)
          throw await ghError("Could not load the service", response);
        const file = (await response.json()) as { content: string };
        savedManifest = serviceManifestSchema.parse(
          JSON.parse(Buffer.from(file.content, "base64").toString()),
        );
      }
    }
    if (savedManifest && savedManifest.serviceId !== data.serviceId)
      throw new Error("This manifest belongs to a different service");
    if (!savedManifest && !data.title)
      throw new Error(
        "This service draft is saved on another browser. Open its published pages from the library or load a Git version.",
      );
    const formId = savedManifest ? savedManifest.formId : (data.formId ?? null);
    // A form that cannot be fetched must not block the workspace: readiness
    // reports the missing form and the next load retries.
    const recipe = formId
      ? await resolveStoredRecipe(formId, token).catch(() => null)
      : null;
    const paths = savedManifest?.pages.map((p) => p.path) ?? data.paths ?? [];
    const pages = await Promise.all(
      paths.map(async (path) => {
        const page = await loadLandingContentPage({ data: { path } });
        if (page.reviewBlock || page.revision.source !== "base")
          throw new Error(
            "Finish this page's existing review before adding it to a service version.",
          );
        return {
          id:
            savedManifest?.pages.find((p) => p.path === path)?.id ??
            randomUUID(),
          path,
          frontmatter: page.frontmatter,
          body: page.body,
          baseSha: page.sha || (await sourceSha(token, path)),
        };
      }),
    );
    const pendingConfig: ServiceSnapshot["pendingConfig"] = formId
      ? await api
          .get<
            ServiceSnapshot["pendingConfig"]
          >(`/builder/forms/${formId}/config`)
          .catch(() => ({ mdaContactId: null, processors: null }))
      : { mdaContactId: null, processors: null };
    const manifest: ServiceManifest = savedManifest ?? {
      schemaVersion: 1,
      serviceId: data.serviceId,
      title: data.title!,
      description: recipe?.description ?? "",
      visibility: "draft",
      category: data.category ?? "",
      subcategory: data.subcategory ?? "",
      formId,
      pages: pages.map((p, i) => ({
        id: p.id,
        path: p.path,
        title: String(p.frontmatter.title ?? "Untitled page"),
        kind:
          i === 0
            ? "main"
            : p.path.endsWith("/start.md")
              ? "start"
              : "guidance",
        publicPath: new URL(
          startPageUrl(
            String(p.frontmatter.category ?? data.category ?? ""),
            contentSlug(p.path),
            String(p.frontmatter.subcategory ?? ""),
          ),
          "https://service.invalid",
        ).pathname,
      })),
      entryPoint: pages[0]?.id ?? (formId ? "form" : null),
      contactDetails: recipe?.contactDetails,
      setup: {
        step: "about",
        delivery: recipe?.processors?.length ? "configured" : "undecided",
        applicantEmail: "undecided",
      },
    };
    return serviceSnapshotSchema.parse({
      manifest,
      pages,
      recipe: redactRecipeSecrets(recipe),
      pendingConfig,
      baseManifestSha,
      baseRecipeSha: formId
        ? await sourceSha(
            token,
            `apps/api/src/forms/form-definitions/recipes/${formId}.json`,
          )
        : null,
    });
  });

// Reuse the existing form draft and presence endpoints; service/page drafts stay in the authoring app.
export const saveServiceRecipe = createServerFn({
  method: "POST",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(
    z.object({
      recipe: draftRecipeSchema,
      expectedRecipe: draftRecipeSchema.nullable(),
      pendingConfig: servicePendingConfigSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const stored = await resolveStoredRecipe(
      data.recipe.formId,
      context.session.accessToken,
    );
    if (stored && !data.expectedRecipe)
      throw new Error(
        "This application already exists. Connect it from the service library.",
      );
    if (
      stored &&
      data.expectedRecipe &&
      !isDeepStrictEqual(
        draftRecipeSchema.parse(redactRecipeSecrets(stored)),
        data.expectedRecipe,
      )
    )
      throw new Error(
        "The application draft changed. Reload before saving these changes.",
      );
    const recipe = restoreRecipeSecrets(data.recipe, stored);
    if (recipe)
      Object.assign(recipe, carryUnauthoredFields(stored ?? undefined, recipe));
    assertNoRedactedSecrets(recipe);
    const claim = await api.put<{ held: boolean }>(
      `/builder/forms/${data.recipe.formId}/presence`,
      { userLogin: context.session.login },
    );
    if (!claim.held)
      throw new Error(
        "Another person is editing this application. Your changes have not been saved.",
      );
    const body = {
      recipe,
      ...data.pendingConfig,
      userLogin: context.session.login,
    };
    if (!stored) await api.post("/builder/forms", { ...body, isNew: true });
    else {
      try {
        await api.put(`/builder/forms/${data.recipe.formId}`, body);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        await api.post("/builder/forms", { ...body, isNew: false });
      }
    }
  });

export const getFormSourceSha = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: serviceIdSchema }))
  .handler(({ data, context }) =>
    sourceSha(
      context.session.accessToken,
      `apps/api/src/forms/form-definitions/recipes/${data.formId}.json`,
    ),
  );
async function github<T>(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!token)
    throw new Error(
      "Sign in with GitHub to save a named version or open a publication pull request.",
    );
  const response = await fetch(repoUrl(path), {
    method,
    headers: authHeaders(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw await ghError(
      "GitHub could not complete the service change",
      response,
    );
  return response.json() as Promise<T>;
}

export function checkpointFiles(
  snapshot: ServiceSnapshot,
): { path: string; content: string }[] {
  const manifest = snapshot.manifest;
  const files = [
    {
      path: `services/${manifest.serviceId}.json`,
      content: JSON.stringify(manifest, null, 2) + "\n",
    },
    ...snapshot.pages.map((page) => ({
      path: page.path,
      content: matter.stringify(page.body + "\n", {
        ...page.frontmatter,
        visibility: manifest.visibility,
      }),
    })),
  ];
  if (snapshot.recipe)
    files.push({
      path: `apps/api/src/forms/form-definitions/recipes/${snapshot.recipe.formId}.json`,
      content:
        JSON.stringify(
          redactRecipeSecrets({
            ...snapshot.recipe,
            meta: { ...snapshot.recipe.meta, visibility: manifest.visibility },
          }),
          null,
          2,
        ) + "\n",
    });
  return files;
}
const versionInput = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(250),
  snapshot: serviceSnapshotSchema,
});
async function retainVersion(
  token: string,
  data: z.infer<typeof versionInput>,
  author: string,
) {
  const files = checkpointFiles(data.snapshot);
  const gitRef = `refs/tags/service-checkpoints/${data.snapshot.manifest.serviceId}/${data.id}`;
  if (!token) throw new Error("Sign in with GitHub to save a named version.");
  const response = await fetch(
    repoUrl(
      `/git/ref/tags/service-checkpoints/${data.snapshot.manifest.serviceId}/${data.id}`,
    ),
    { headers: authHeaders(token), signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok && response.status !== 404)
    throw await ghError("Could not check the saved Git version", response);
  const existing = response.ok
    ? ((await response.json()) as { object: { sha: string } })
    : null;
  if (existing) {
    await Promise.all(
      files.map(async (file) => {
        const content = Buffer.from(file.content);
        const expected = createHash("sha1")
          .update(`blob ${content.length}\0`)
          .update(content)
          .digest("hex");
        const response = await getContents(
          token,
          file.path,
          existing.object.sha,
        );
        if (
          !response.ok ||
          ((await response.json()) as { sha: string }).sha !== expected
        )
          throw new Error("The existing Git version does not match this draft");
      }),
    );
    return { gitSha: existing.object.sha, gitRef };
  }
  const base = await github<{ object: { sha: string } }>(
    token,
    `/git/ref/heads/${encodeURIComponent(resolveBaseBranch())}`,
  );
  const parent = await github<{ tree: { sha: string } }>(
    token,
    `/git/commits/${base.object.sha}`,
  );
  const tree = await github<{ sha: string }>(token, "/git/trees", "POST", {
    base_tree: parent.tree.sha,
    tree: files.map((file) => ({ ...file, mode: "100644", type: "blob" })),
  });
  const commit = await github<{ sha: string }>(token, "/git/commits", "POST", {
    message: `${data.label}\n\nService ${data.snapshot.manifest.serviceId}; by ${author}`,
    tree: tree.sha,
    parents: [base.object.sha],
  });
  await github(token, "/git/refs", "POST", { ref: gitRef, sha: commit.sha });
  return { gitSha: commit.sha, gitRef };
}
export const retainServiceVersion = createServerFn({
  method: "POST",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(versionInput)
  .handler(({ data, context }) =>
    retainVersion(context.session.accessToken, data, context.session.login),
  );

export const publishServiceVersion = createServerFn({
  method: "POST",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(versionInput)
  .handler(async ({ data, context }) => {
    const token = context.session.accessToken;
    const { snapshot } = data;
    const ready = serviceReadiness(snapshot);
    if (!ready.ready)
      throw new Error(ready.issues.map((i) => i.message).join(". "));
    if (
      JSON.stringify(redactRecipeSecrets(snapshot.recipe)) !==
      JSON.stringify(snapshot.recipe)
    )
      throw new Error(
        "Move embedded credentials to the existing private configuration before publication.",
      );
    assertNoRedactedSecrets(snapshot.recipe);
    if (snapshot.recipe) {
      const result = await api.post<{
        ok: boolean;
        issues?: { message: string }[];
      }>("/builder/registry/validate", { recipe: snapshot.recipe });
      if (!result.ok)
        throw new Error(
          result.issues?.map((i) => i.message).join(". ") ||
            "Fix the application errors before publication",
        );
    }
    const files = checkpointFiles(snapshot);
    const paths = new Set(files.map((f) => f.path));
    const branch = `service-builder/${snapshot.manifest.serviceId}-${data.id}`;
    const prs = await listOpenPRHeads(token, resolveBaseBranch());
    const own = prs.find((pr) => pr.headRef === branch);
    if (own) {
      const retained = await retainVersion(token, data, context.session.login);
      const pr = await github<{ html_url: string; head: { sha: string } }>(
        token,
        `/pulls/${own.number}`,
      );
      if (pr.head.sha !== retained.gitSha)
        throw new Error(
          "The publication branch has changed. Review its existing pull request in GitHub.",
        );
      return { prNumber: own.number, prUrl: pr.html_url };
    }
    for (const pr of prs) {
      const touched = await github<
        { filename: string; previous_filename?: string }[]
      >(token, `/pulls/${pr.number}/files?per_page=100`);
      if (
        touched.length === 100 ||
        touched.some(
          (f) => paths.has(f.filename) || paths.has(f.previous_filename ?? ""),
        )
      )
        throw new Error(
          `Pull request #${pr.number} may already change this service. Finish it before another publication.`,
        );
    }
    const sources = [
      {
        path: `services/${snapshot.manifest.serviceId}.json`,
        sha: snapshot.baseManifestSha,
      },
      ...snapshot.pages.map((p) => ({ path: p.path, sha: p.baseSha })),
      ...(snapshot.recipe
        ? [
            {
              path: `apps/api/src/forms/form-definitions/recipes/${snapshot.recipe.formId}.json`,
              sha: snapshot.baseRecipeSha,
            },
          ]
        : []),
    ];
    for (const file of sources)
      if ((await sourceSha(token, file.path)) !== file.sha)
        throw new Error(
          `The published source for ${file.path} changed. Reload and compare before publication.`,
        );
    const retained = await retainVersion(token, data, context.session.login);
    const response = await fetch(repoUrl(`/git/ref/heads/${branch}`), {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 404)
      await github(token, "/git/refs", "POST", {
        ref: `refs/heads/${branch}`,
        sha: retained.gitSha,
      });
    else if (
      !response.ok ||
      ((await response.json()) as { object: { sha: string } }).object.sha !==
        retained.gitSha
    )
      throw new Error(
        "The publication branch changed. Review its pull request before retrying.",
      );
    return openPullRequest(token, {
      head: branch,
      base: resolveBaseBranch(),
      title: `Update service: ${snapshot.manifest.title}`,
      body: `Publish **${data.label}** with ${snapshot.pages.length} content pages${snapshot.recipe ? " and the application form" : ""}.\n\nReview the existing environment's delivery and payment settings before deployment.\n\nCreated by @${context.session.login}.`,
    });
  });

export const getServicePublication = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(z.object({ prNumber: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const pr = await github<{
      state: string;
      merged_at: string | null;
      html_url: string;
    }>(context.session.accessToken, `/pulls/${data.prNumber}`);
    return {
      state: pr.merged_at
        ? "merged"
        : pr.state === "open"
          ? "review"
          : "closed",
      prUrl: pr.html_url,
    };
  });
export interface ServiceGitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}
export const getServiceGitHistory = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([requireSession])
  .inputValidator(z.object({ serviceId: serviceIdSchema, path: z.string() }))
  .handler(async ({ data, context }): Promise<ServiceGitCommit[]> => {
    if (
      data.path !== `services/${data.serviceId}.json` &&
      !servicePageDraftSchema.shape.path.safeParse(data.path).success &&
      !/^apps\/api\/src\/forms\/form-definitions\/recipes\/[a-z0-9-]+\.json$/.test(
        data.path,
      )
    )
      throw new Error("Choose a service page or application");
    const commits = await github<
      {
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } };
      }[]
    >(
      context.session.accessToken,
      `/commits?${new URLSearchParams({ path: data.path, sha: resolveBaseBranch(), per_page: "25" })}`,
    );
    return commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
  });
