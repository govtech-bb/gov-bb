import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { AiService } from "./ai.service";
import {
  ChatMessage,
  SessionResponse,
  PublishResponse,
} from "./dto/chat-message.dto";
import { CustomComponent } from "../registry/entities/custom-component.entity";
import { FormDefinitionEntity } from "../database/entities/form-definition.entity";

interface Session {
  id: string;
  name: string;
  messages: ChatMessage[];
  recipe: Record<string, unknown> | null;
  systemPrompt: string;
  pdfPages?: string[];
  publishedFormId?: string;
  createdAt: Date;
}

@Injectable()
export class FormBuilderService {
  private readonly logger = new Logger(FormBuilderService.name);
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly aiService: AiService,
    @InjectRepository(CustomComponent)
    private readonly customComponentRepo: Repository<CustomComponent>,
    @InjectRepository(FormDefinitionEntity)
    private readonly formDefRepo: Repository<FormDefinitionEntity>,
  ) {}

  async createSession(name?: string): Promise<SessionResponse> {
    const sessionId = randomUUID();

    // Build system prompt with live custom components
    const customs = await this.customComponentRepo.find();
    const componentList = customs
      .map(
        (c) =>
          `- \`components/${c.namespace}/${c.type}\` — ${(c.definition as any)?.htmlType ?? "unknown"} (${(c.definition as any)?.label ?? "no label"})`,
      )
      .join("\n");

    const systemPrompt = this.aiService.buildSystemPrompt(componentList);

    const session: Session = {
      id: sessionId,
      name: name ?? `Session ${new Date().toISOString()}`,
      messages: [],
      recipe: null,
      systemPrompt,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.logger.log(`Created session ${sessionId}`);

    return {
      sessionId,
      messages: [],
      recipe: null,
    };
  }

  async sendMessage(
    sessionId: string,
    message: string,
    pdfPages?: string[],
  ): Promise<SessionResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Store PDF pages on first upload
    if (pdfPages && pdfPages.length > 0 && !session.pdfPages) {
      session.pdfPages = pdfPages;
    }

    // Add user message
    session.messages.push({ role: "user", content: message });

    // Call Claude — always include PDF pages so the AI retains form context
    const assistantResponse = await this.aiService.chat(
      session.systemPrompt,
      session.messages,
      session.pdfPages,
    );

    // Add assistant response
    session.messages.push({ role: "assistant", content: assistantResponse });

    // Try to extract recipe JSON from the latest response
    let recipe = this.extractRecipe(assistantResponse);

    // If not found in latest, scan all assistant messages (recipe might be in an earlier one)
    if (!recipe) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === "assistant") {
          recipe = this.extractRecipe(session.messages[i].content);
          if (recipe) break;
        }
      }
    }

    if (recipe) {
      session.recipe = recipe;
    }

    return {
      sessionId,
      messages: session.messages,
      recipe: session.recipe,
    };
  }

  getSession(sessionId: string): SessionResponse | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      messages: session.messages,
      recipe: session.recipe,
    };
  }

  getRecipe(sessionId: string): Record<string, unknown> | null {
    const session = this.sessions.get(sessionId);
    return session?.recipe ?? null;
  }

  /**
   * Manually scan all assistant messages and try to extract a recipe.
   * Called when automatic extraction missed it.
   */
  manualExtract(sessionId: string): Record<string, unknown> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].role === "assistant") {
        const recipe = this.extractRecipe(session.messages[i].content);
        if (recipe) {
          session.recipe = recipe;
          this.logger.log(`Manual extraction found recipe in message ${i}`);
          return recipe;
        }
      }
    }
    return null;
  }

  async publish(
    sessionId: string,
    formIdOverride?: string,
  ): Promise<PublishResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (!session.recipe) {
      throw new Error("No recipe generated yet. Continue the conversation.");
    }

    const recipe = session.recipe as any;
    const formId = formIdOverride ?? recipe.formId;

    if (!formId) {
      throw new Error("Recipe has no formId. Provide one via the request.");
    }

    // Validate recipe against the platform schema before publishing
    // Use a lenient check — verify structure without strict discriminated union validation
    if (!recipe.formId || !recipe.steps || !Array.isArray(recipe.steps)) {
      throw new Error("Recipe must have formId and steps array.");
    }
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      if (
        !step.stepId ||
        !step.title ||
        !step.elements ||
        !Array.isArray(step.elements)
      ) {
        throw new Error(
          `Step ${i} must have stepId, title, and elements array.`,
        );
      }
      for (let j = 0; j < step.elements.length; j++) {
        const el = step.elements[j];
        if (
          !el.ref ||
          (!el.ref.startsWith("components/") && !el.ref.startsWith("blocks/"))
        ) {
          throw new Error(
            `Step "${step.stepId}" element ${j}: ref must start with "components/" or "blocks/" (got "${el.ref}").`,
          );
        }
        // Blocks have internal fieldIds — only require fieldId override for components
        if (el.ref.startsWith("components/") && !el.overrides?.fieldId) {
          throw new Error(
            `Step "${step.stepId}" element ${j} (ref: ${el.ref}): missing fieldId in overrides.`,
          );
        }
      }
    }
    if (!recipe.createdAt || !recipe.updatedAt || !recipe.version) {
      throw new Error(
        "Recipe must have createdAt, updatedAt, and version fields.",
      );
    }

    // Build the SQL for export
    const sql = this.buildSql(formId, recipe);

    // Write to database (upsert — if re-publishing after edits, delete old version first)
    if (session.publishedFormId) {
      await this.formDefRepo.delete({ formId: session.publishedFormId });
    }
    const entity = this.formDefRepo.create({
      formId,
      version: recipe.version ?? "1.0.0",
      schema: recipe,
      publishedAt: new Date(),
    });
    await this.formDefRepo.save(entity);

    // Track what we published so we can delete it later
    session.publishedFormId = formId;

    this.logger.log(`Published form: ${formId}`);

    const previewUrl = `https://app-sandbox.alpha.gov.bb/forms/${formId}`;

    return {
      formId,
      message: `Form "${formId}" published successfully.`,
      sql,
      previewUrl,
    };
  }

  /**
   * Delete the form published in this session. Only allows deleting forms
   * that were created in this specific session — cannot delete other forms.
   */
  async deletePublished(sessionId: string): Promise<{ message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (!session.publishedFormId) {
      throw new Error("No form has been published in this session.");
    }

    await this.formDefRepo.delete({ formId: session.publishedFormId });
    const deletedFormId = session.publishedFormId;
    session.publishedFormId = undefined;

    this.logger.log(`Deleted form: ${deletedFormId}`);
    return { message: `Form "${deletedFormId}" deleted successfully.` };
  }

  /**
   * Generate the SQL INSERT statement for export/download.
   */
  generateSql(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session?.recipe) return null;

    const recipe = session.recipe as any;
    const formId = recipe.formId ?? "unnamed-form";
    return this.buildSql(formId, recipe);
  }

  private buildSql(formId: string, recipe: Record<string, unknown>): string {
    const json = JSON.stringify(recipe, null, 2);
    return `INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '${formId}',
  '1.0.0',
  $recipe$${json}$recipe$,
  NOW(),
  NOW(),
  NOW()
);`;
  }

  /**
   * Try to extract a JSON recipe from the assistant's response.
   * Uses multiple strategies to find the recipe JSON.
   */
  private extractRecipe(text: string): Record<string, unknown> | null {
    // Strategy 1: Look for ```json ... ``` blocks
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = jsonBlockRegex.exec(text)) !== null) {
      const parsed = this.tryParseRecipe(match[1]);
      if (parsed) return parsed;
    }

    // Strategy 2: Look for ``` ... ``` blocks (without json language tag)
    const codeBlockRegex = /```\s*([\s\S]*?)```/g;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const parsed = this.tryParseRecipe(match[1]);
      if (parsed) return parsed;
    }

    // Strategy 3: Find the largest JSON object in the text that has formId
    const bracePositions: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") bracePositions.push(i);
    }

    // Try from each opening brace, find matching close
    for (const start of bracePositions) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === "{") depth++;
        if (text[i] === "}") depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
      if (end > start) {
        const candidate = text.substring(start, end);
        if (candidate.includes('"formId"') && candidate.includes('"steps"')) {
          const parsed = this.tryParseRecipe(candidate);
          if (parsed) return parsed;
        }
      }
    }

    return null;
  }

  /**
   * Try to parse a string as a recipe JSON. Returns null if invalid.
   */
  private tryParseRecipe(text: string): Record<string, unknown> | null {
    try {
      // Strip $recipe$ wrappers if present (AI sometimes outputs inside SQL)
      let cleaned = text.trim();
      if (cleaned.includes("$recipe$")) {
        const start = cleaned.indexOf("$recipe$") + "$recipe$".length;
        const end = cleaned.lastIndexOf("$recipe$");
        if (end > start) {
          cleaned = cleaned.substring(start, end).trim();
        }
      }
      // Strip SQL wrapper if the text starts with INSERT
      if (cleaned.toUpperCase().startsWith("INSERT")) {
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }
      }

      const parsed = JSON.parse(cleaned);
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.formId &&
        parsed.steps &&
        Array.isArray(parsed.steps)
      ) {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }
    return null;
  }
}
