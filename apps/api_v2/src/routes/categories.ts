import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Employee } from "../modules/auth";
import type { Viewer } from "../modules/page-visibility";
import type {
  CategoryDeleteFailure,
  CategoryUpdateFailure,
  ICategoryEditing,
} from "../services/category-editing";
import type { SiteNavigation } from "../services/site-navigation";
import { IF_UPDATED_AT, SCHEMAS } from "./contracts";
import { siteNotFoundCache, siteReadCache, storageFailed } from "./responses";

function categoryFailed(
  error: CategoryUpdateFailure | CategoryDeleteFailure,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  switch (error._tag) {
    case "CategoryRejected":
      return reply.status(422).send({
        error: "validation_failed",
        message: error.message,
        errors: [...error.errors],
      });
    case "CategoryNotFound":
      return reply
        .status(404)
        .send({ error: "not_found", message: error.message });
    case "CategoryConflict":
      return reply
        .status(409)
        .send({ error: "conflict", message: error.message });
    case "CategoryInUse":
      return reply.status(409).send({
        error: "category_in_use",
        message: error.message,
        blockers: error.blockers,
      });
    case "ContentStoreUnavailable":
      return reply.status(500).send(storageFailed(request.log, error));
    default: {
      const unexpected: never = error;
      throw unexpected;
    }
  }
}

/** Category management inherits the editor scope's employee, Origin and no-store checks. */
export const editorCategoryRoutes: FastifyPluginAsyncZod<{
  categories: ICategoryEditing;
  actor: (request: FastifyRequest) => Employee;
}> = async (editor, { categories, actor }) => {
  editor.route({
    method: "GET",
    url: "/editor/categories",
    schema: SCHEMAS.editorCategories,
    handler: async (request, reply) => {
      const result = await categories.list();
      return result.ok
        ? { categories: result.value }
        : categoryFailed(result.error, request, reply);
    },
  });
  editor.route({
    method: "POST",
    url: "/editor/categories",
    schema: SCHEMAS.createCategory,
    config: { role: "approver" },
    handler: async (request, reply) => {
      const result = await categories.create(request.body, actor(request));
      return result.ok
        ? reply.status(201).send(result.value)
        : categoryFailed(result.error, request, reply);
    },
  });
  editor.route({
    method: "PUT",
    url: "/editor/categories/:id",
    schema: SCHEMAS.updateCategory,
    config: { role: "approver" },
    handler: async (request, reply) => {
      const result = await categories.update(
        request.params.id,
        request.body,
        request.headers[IF_UPDATED_AT],
        actor(request),
      );
      return result.ok
        ? result.value
        : categoryFailed(result.error, request, reply);
    },
  });
  editor.route({
    method: "PUT",
    url: "/editor/categories/order",
    schema: SCHEMAS.orderCategories,
    config: { role: "approver" },
    handler: async (request, reply) => {
      const result = await categories.reorder(request.body, actor(request));
      return result.ok
        ? { categories: result.value }
        : categoryFailed(result.error, request, reply);
    },
  });
  editor.route({
    method: "DELETE",
    url: "/editor/categories/:id",
    schema: SCHEMAS.deleteCategory,
    config: { role: "approver" },
    handler: async (request, reply) => {
      const result = await categories.delete(
        request.params.id,
        request.headers[IF_UPDATED_AT],
        actor(request),
      );
      return result.ok
        ? reply.status(204).send()
        : categoryFailed(result.error, request, reply);
    },
  });
};

/** Public category reads inherit the site scope's preview admission and ETag handling. */
export const publicCategoryRoutes: FastifyPluginAsyncZod<{
  navigation: SiteNavigation;
  viewerFor: (request: FastifyRequest) => Viewer;
}> = async (site, { navigation, viewerFor }) => {
  site.route({
    method: "GET",
    url: "/categories",
    schema: SCHEMAS.getCategories,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const categories = await navigation.categories(viewer);
      if (!categories.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, categories.error));
      reply.header("Cache-Control", siteReadCache(viewer));
      return { categories: categories.value };
    },
  });

  site.route({
    method: "GET",
    url: "/categories/:slug",
    schema: SCHEMAS.getCategory,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const { slug } = request.params;
      const listing = await navigation.categoryListing([slug], viewer);
      if (!listing.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, listing.error));
      if (listing.value === null) {
        return reply
          .header("Cache-Control", siteNotFoundCache(viewer))
          .status(404)
          .send({ error: "not_found", message: `No category at /${slug}` });
      }
      reply.header("Cache-Control", siteReadCache(viewer));
      return listing.value;
    },
  });

  site.route({
    method: "GET",
    url: "/categories/:category/:slug",
    schema: SCHEMAS.getSubcategory,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const { category, slug } = request.params;
      const listing = await navigation.categoryListing(
        [category, slug],
        viewer,
      );
      if (!listing.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, listing.error));
      if (listing.value === null) {
        return reply
          .header("Cache-Control", siteNotFoundCache(viewer))
          .status(404)
          .send({
            error: "not_found",
            message: `No category at /${category}/${slug}`,
          });
      }
      reply.header("Cache-Control", siteReadCache(viewer));
      return listing.value;
    },
  });
};
