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

    // Call Claude
    const assistantResponse = await this.aiService.chat(
      session.systemPrompt,
      session.messages,
      session.messages.length === 1 ? session.pdfPages : undefined,
    );

    // Add assistant response
    session.messages.push({ role: "assistant", content: assistantResponse });

    // Try to extract recipe JSON from the response
    const recipe = this.extractRecipe(assistantResponse);
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

    // Build the SQL for export
    const sql = this.buildSql(formId, recipe);

    // Write to database
    const entity = this.formDefRepo.create({
      formId,
      version: recipe.version ?? "1.0.0",
      schema: recipe,
      publishedAt: new Date(),
    });
    await this.formDefRepo.save(entity);

    this.logger.log(`Published form: ${formId}`);

    return {
      formId,
      message: `Form "${formId}" published successfully.`,
      sql,
    };
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
   * Looks for a JSON code block containing a formId field.
   */
  private extractRecipe(text: string): Record<string, unknown> | null {
    // Look for ```json ... ``` blocks
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.formId && parsed.steps) {
          return parsed;
        }
      } catch {
        // Not valid JSON, skip
      }
    }

    // Also try to find raw JSON objects with formId
    const rawJsonRegex = /\{[\s\S]*?"formId"[\s\S]*?"steps"[\s\S]*?\}/;
    const rawMatch = rawJsonRegex.exec(text);
    if (rawMatch) {
      try {
        const parsed = JSON.parse(rawMatch[0]);
        if (parsed.formId && parsed.steps) {
          return parsed;
        }
      } catch {
        // Not valid JSON
      }
    }

    return null;
  }
}
