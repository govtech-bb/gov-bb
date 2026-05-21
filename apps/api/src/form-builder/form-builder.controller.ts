import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { FormBuilderService } from "./form-builder.service";
import {
  CreateSessionDto,
  SendMessageDto,
  PublishDto,
  SessionResponse,
  PublishResponse,
} from "./dto/chat-message.dto";
import { AiService } from "./ai.service";
import { isPdfBuffer, pdfFileFilter } from "./pdf-validation";
import { AdminTokenGuard } from "./admin-token.guard";

@ApiTags("Form Builder")
@UseGuards(AdminTokenGuard)
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
   * Send a message to an existing session (text + optional PDF upload via multipart).
   */
  @Post("sessions/:sessionId/messages")
  @Throttle({
    medium: { ttl: 60_000, limit: 10 },
    long: { ttl: 3_600_000, limit: 100 },
  })
  @UseInterceptors(
    FileInterceptor("pdf", {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: pdfFileFilter,
    }),
  )
  async sendMessage(
    @Param("sessionId") sessionId: string,
    @Body("message") message: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<SessionResponse> {
    if (!this.aiService.isAvailable()) {
      throw new HttpException(
        "AI service not configured. Set ANTHROPIC_API_KEY.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!message) {
      throw new HttpException("Message is required", HttpStatus.BAD_REQUEST);
    }

    let pdfPages: string[] | undefined;
    if (file) {
      if (!isPdfBuffer(file.buffer)) {
        throw new HttpException(
          "Uploaded file is not a valid PDF (magic bytes missing)",
          HttpStatus.BAD_REQUEST,
        );
      }
      pdfPages = [file.buffer.toString("base64")];
    }

    try {
      return await this.formBuilderService.sendMessage(
        sessionId,
        message,
        pdfPages,
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
   * Manually trigger recipe extraction from all messages in the session.
   */
  @Post("sessions/:sessionId/extract")
  extractRecipe(@Param("sessionId") sessionId: string) {
    const result = this.formBuilderService.manualExtract(sessionId);
    if (!result) {
      throw new HttpException(
        "Could not find a valid recipe in the conversation. The AI must output JSON with formId and steps fields.",
        HttpStatus.NOT_FOUND,
      );
    }
    return { recipe: result };
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

  /**
   * Delete the form published in this session (scoped — can only delete own form).
   */
  @Post("sessions/:sessionId/delete")
  async deletePublished(@Param("sessionId") sessionId: string) {
    try {
      return await this.formBuilderService.deletePublished(sessionId);
    } catch (err: any) {
      if (
        err.message?.includes("not found") ||
        err.message?.includes("No form")
      ) {
        throw new HttpException(err.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        err.message ?? "Delete failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
