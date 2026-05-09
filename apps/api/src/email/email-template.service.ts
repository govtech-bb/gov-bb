import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import Handlebars from "handlebars";
import type { TemplateDelegate } from "handlebars";

/**
 * Loads, compiles, and renders Handlebars email templates from
 * `src/email/templates/`.  Each `.hbs` file is keyed by its basename
 * (without extension), which matches the form slug / formId so templates
 * are auto-resolved from the submission payload.
 *
 * Template rendering context:
 *   - Every step's values are spread as top-level keys
 *     (e.g. `payload.values.personal` → `{{personal.firstName}}`)
 *   - `submissionId`  — unique submission reference
 *   - `processedAt`   — ISO timestamp of when the email was sent
 *   - `submittedAt`   — ISO timestamp from the submission audit trail
 */
@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templates = new Map<string, TemplateDelegate>();

  constructor() {
    this.registerHelpers();
    this.loadTemplates(path.join(__dirname, "templates"));
  }

  /** Register Handlebars helpers used across templates. */
  private registerHelpers(): void {
    // {{#if (eq value 'expected')}} — strict equality check
    if (!Handlebars.helpers["eq"]) {
      Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
    }
  }

  /** Read every `.hbs` file in `dir` and compile it into the cache. */
  private loadTemplates(dir: string): void {
    if (!fs.existsSync(dir)) {
      this.logger.warn(`Email templates directory not found: ${dir}`);
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".hbs"));

    for (const file of files) {
      const id = path.basename(file, ".hbs");
      try {
        const source = fs.readFileSync(path.join(dir, file), "utf-8");
        this.templates.set(id, Handlebars.compile(source));
      } catch (err) {
        this.logger.error(`Failed to load/compile template "${id}"`, err);
      }
    }

    this.logger.log(`Loaded ${this.templates.size} email template(s)`);
  }

  /** Returns true when a compiled template exists for the given id. */
  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  /**
   * Renders the template identified by `templateId` with the supplied context.
   * Returns `null` when no template is registered for that id or if rendering
   * throws, so callers can fall back to a generic body.
   */
  render(templateId: string, context: Record<string, unknown>): string | null {
    const tpl = this.templates.get(templateId);
    if (!tpl) return null;

    try {
      return tpl(context);
    } catch (err) {
      this.logger.error(`Failed to render template "${templateId}"`, err);
      return null;
    }
  }
}
