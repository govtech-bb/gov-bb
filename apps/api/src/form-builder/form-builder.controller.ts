import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { FormBuilderService } from "./form-builder.service";
import {
  CreateSessionDto,
  SendMessageDto,
  PublishDto,
  SessionResponse,
  PublishResponse,
} from "./dto/chat-message.dto";
import { AiService } from "./ai.service";

@ApiTags("Form Builder")
@SkipThrottle()
@Controller("form-builder")
export class FormBuilderController {
  constructor(
    private readonly formBuilderService: FormBuilderService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Check if the AI service is available and configured.
   */
  @Get("status")
  getStatus() {
    return {
      available: this.aiService.isAvailable(),
      message: this.aiService.isAvailable()
        ? "AI service is ready"
        : "AI service not configured. Set ANTHROPIC_API_KEY in environment.",
    };
  }

  /**
   * Create a new form builder session.
   */
  @Post("sessions")
  async createSession(@Body() dto: CreateSessionDto): Promise<SessionResponse> {
    return this.formBuilderService.createSession(dto?.name);
  }

  /**
   * Send a message to an existing session (text + optional PDF pages).
   */
  @Post("sessions/:sessionId/messages")
  async sendMessage(
    @Param("sessionId") sessionId: string,
    @Body() dto: SendMessageDto,
  ): Promise<SessionResponse> {
    if (!this.aiService.isAvailable()) {
      throw new HttpException(
        "AI service not configured. Set ANTHROPIC_API_KEY.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      return await this.formBuilderService.sendMessage(
        sessionId,
        dto.message,
        dto.pdfPages,
      );
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        throw new HttpException(err.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        err.message ?? "AI request failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get the current state of a session.
   */
  @Get("sessions/:sessionId")
  getSession(@Param("sessionId") sessionId: string): SessionResponse {
    const session = this.formBuilderService.getSession(sessionId);
    if (!session) {
      throw new HttpException("Session not found", HttpStatus.NOT_FOUND);
    }
    return session;
  }

  /**
   * Get the current recipe JSON from a session.
   */
  @Get("sessions/:sessionId/recipe")
  getRecipe(@Param("sessionId") sessionId: string) {
    const recipe = this.formBuilderService.getRecipe(sessionId);
    if (!recipe) {
      throw new HttpException("No recipe generated yet", HttpStatus.NOT_FOUND);
    }
    return { recipe };
  }

  /**
   * Get the SQL export for the current recipe.
   */
  @Get("sessions/:sessionId/sql")
  getSql(@Param("sessionId") sessionId: string) {
    const sql = this.formBuilderService.generateSql(sessionId);
    if (!sql) {
      throw new HttpException("No recipe generated yet", HttpStatus.NOT_FOUND);
    }
    return { sql };
  }

  /**
   * Publish the recipe to the database (makes the form live).
   */
  @Post("sessions/:sessionId/publish")
  async publish(
    @Param("sessionId") sessionId: string,
    @Body() dto: PublishDto,
  ): Promise<PublishResponse> {
    try {
      return await this.formBuilderService.publish(sessionId, dto?.formId);
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        throw new HttpException(err.message, HttpStatus.NOT_FOUND);
      }
      if (err.message?.includes("No recipe")) {
        throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(
        err.message ?? "Publish failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
