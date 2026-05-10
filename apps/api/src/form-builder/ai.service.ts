import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "fs";
import { join } from "path";
import { ChatMessage } from "./dto/chat-message.dto";

/**
 * Wraps the Anthropic SDK or AWS Bedrock to call Claude for form recipe generation.
 *
 * Supports two providers:
 * - "anthropic" (default for local dev) — uses ANTHROPIC_API_KEY
 * - "bedrock" — uses IAM credentials (SSO locally, task role in ECS)
 *
 * The system prompt is loaded from prompts/system-prompt.md at startup.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private systemPrompt: string = "";
  private client: any; // Anthropic SDK client or Bedrock client
  private provider: "anthropic" | "bedrock" = "anthropic";
  private model: string = "claude-sonnet-4-20250514";
  private bedrockModelId: string = "us.anthropic.claude-sonnet-4-6";

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Load system prompt from file
    try {
      const possiblePaths = [
        join(__dirname, "prompts", "system-prompt.md"),
        join(__dirname, "..", "form-builder", "prompts", "system-prompt.md"),
        join(process.cwd(), "apps", "api", "src", "form-builder", "prompts", "system-prompt.md"),
        join(process.cwd(), "src", "form-builder", "prompts", "system-prompt.md"),
        join(process.cwd(), "dist", "src", "form-builder", "prompts", "system-prompt.md"),
        "/app/apps/api/src/form-builder/prompts/system-prompt.md",
      ];
      
      this.logger.log(`Looking for system prompt in paths: ${possiblePaths.join(", ")}`);
      this.logger.log(`__dirname = ${__dirname}, cwd = ${process.cwd()}`);
      
      
      for (const p of possiblePaths) {
        try {
          this.systemPrompt = readFileSync(p, "utf-8");
          this.logger.log(`System prompt loaded from ${p} (${this.systemPrompt.length} chars)`);
          break;
        } catch {
          // try next path
        }
      }
      
      if (!this.systemPrompt) {
        this.logger.warn("Could not load system-prompt.md from any path — AI will work but without form creation context");
      }
    } catch (err) {
      this.logger.warn(
        "Could not load system-prompt.md — AI features will work but without form creation context",
      );
    }

    // Determine provider
    this.provider =
      (this.configService.get<string>("AI_PROVIDER") as any) ?? "anthropic";
    this.model =
      this.configService.get<string>("AI_MODEL") ?? "claude-sonnet-4-20250514";
    this.bedrockModelId =
      this.configService.get<string>("AI_MODEL") ?? "us.anthropic.claude-sonnet-4-6";

    if (this.provider === "bedrock") {
      await this.initBedrock();
    } else {
      await this.initAnthropic();
    }
  }

  private async initAnthropic() {
    const apiKey = this.configService.get<string>("ANTHROPIC_API_KEY");
    if (!apiKey) {
      this.logger.warn("ANTHROPIC_API_KEY not set — AI features will not work");
      return;
    }
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      this.client = new Anthropic({ apiKey });
      this.logger.log(
        `AI service initialized (provider: anthropic, model: ${this.model})`,
      );
    } catch {
      this.logger.warn(
        "@anthropic-ai/sdk not installed — run: npm install @anthropic-ai/sdk",
      );
    }
  }

  private async initBedrock() {
    try {
      const { BedrockRuntimeClient } =
        await import("@aws-sdk/client-bedrock-runtime");

      // Uses default credential chain: SSO locally, task role in ECS
      this.client = new BedrockRuntimeClient({
        region: this.configService.get<string>("AWS_REGION") ?? "us-east-1",
      });
      this.logger.log(
        `AI service initialized (provider: bedrock, model: ${this.bedrockModelId})`,
      );
    } catch {
      this.logger.warn(
        "@aws-sdk/client-bedrock-runtime not installed — run: npm install @aws-sdk/client-bedrock-runtime",
      );
    }
  }

  /**
   * Appends custom component context to the system prompt.
   */
  buildSystemPrompt(customComponentsList: string): string {
    if (!customComponentsList) return this.systemPrompt;
    return `${this.systemPrompt}\n\n## Live Custom Components (from database)\n${customComponentsList}`;
  }

  /**
   * Send a conversation to Claude and get the assistant's response.
   */
  async chat(
    systemPrompt: string,
    messages: ChatMessage[],
    pdfPages?: string[],
  ): Promise<string> {
    if (!this.client) {
      throw new Error("AI service not initialized. Check configuration.");
    }

    if (this.provider === "bedrock") {
      return this.chatBedrock(systemPrompt, messages, pdfPages);
    }
    return this.chatAnthropic(systemPrompt, messages, pdfPages);
  }

  private async chatAnthropic(
    systemPrompt: string,
    messages: ChatMessage[],
    pdfPages?: string[],
  ): Promise<string> {
    const apiMessages = messages.map((msg, idx) => {
      if (msg.role === "user" && pdfPages && idx === 0) {
        const content: any[] = pdfPages.map((page) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: page,
          },
        }));
        content.push({ type: "text", text: msg.content });
        return { role: "user" as const, content };
      }
      return { role: msg.role as "user" | "assistant", content: msg.content };
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: apiMessages,
    });

    const textBlock = response.content.find(
      (block: any) => block.type === "text",
    );
    return textBlock?.text ?? "";
  }

  private async chatBedrock(
    systemPrompt: string,
    messages: ChatMessage[],
    pdfPages?: string[],
  ): Promise<string> {
    const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");

    // Build Bedrock Converse API messages
    const bedrockMessages = messages.map((msg, idx) => {
      if (msg.role === "user" && pdfPages && idx === 0) {
        const content: any[] = pdfPages.map((page) => ({
          document: {
            format: "pdf" as const,
            name: "uploaded-form",
            source: { bytes: Buffer.from(page, "base64") },
          },
        }));
        content.push({ text: msg.content });
        return { role: "user" as const, content };
      }
      return {
        role: msg.role as "user" | "assistant",
        content: [{ text: msg.content }],
      };
    });

    const command = new ConverseCommand({
      modelId: this.bedrockModelId,
      system: [{ text: systemPrompt }],
      messages: bedrockMessages as any,
      inferenceConfig: { maxTokens: 8192 },
    });

    const response = await this.client.send(command);
    const textBlock = response.output?.message?.content?.find(
      (block: any) => block.text,
    );
    return textBlock?.text ?? "";
  }

  isAvailable(): boolean {
    return !!this.client;
  }
}
