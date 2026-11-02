import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { verifySlackSignature } from "./slack-signature";
import { parseStatsCommand, usageText } from "./stats-command";
import { SlackStatsService, slackResponseUrl } from "./slack-stats.service";

interface SlashCommandBody {
  command?: string;
  text?: string;
  response_url?: string;
}

interface SlackReply {
  response_type: "ephemeral";
  text: string;
}

/**
 * Slack slash command `/stats <today|week|month> [form-id]` (#3491). Slack
 * waits 3 seconds for a reply, and the Umami queries take longer, so this
 * acknowledges at once and SlackStatsService posts the stats to the command's
 * response_url when they are ready. Every request must carry a valid Slack
 * signature (SLACK_SIGNING_SECRET); an unset secret refuses everything.
 */
@ApiExcludeController()
@Controller("slack/commands")
export class SlackStatsController {
  private readonly logger = new Logger(SlackStatsController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly stats: SlackStatsService,
  ) {}

  @Post("stats")
  @HttpCode(200)
  handleStats(
    @Body() body: SlashCommandBody,
    @Headers("x-slack-request-timestamp") timestamp: string | undefined,
    @Headers("x-slack-signature") signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): SlackReply {
    const verified = verifySlackSignature({
      secret: this.config.get<string>("SLACK_SIGNING_SECRET") ?? "",
      timestamp,
      rawBody: req.rawBody?.toString("utf8") ?? "",
      signature,
    });
    if (!verified) throw new UnauthorizedException("Invalid Slack signature");

    const command = body.command || "/stats";
    const reply = (text: string): SlackReply => ({
      response_type: "ephemeral",
      text,
    });
    const parsed = parseStatsCommand(body.text ?? "");
    if (parsed.kind === "help") return reply(usageText(command));
    if (!this.stats.isConfigured()) {
      return reply("Stats are not set up in this environment yet.");
    }
    const responseUrl = slackResponseUrl(body.response_url ?? "");
    if (!responseUrl) {
      this.logger.warn("[slack-stats] refused a non-Slack response_url");
      return reply("Slack didn't send a reply address, so I can't answer.");
    }

    void this.stats.respond({ command, ...parsed }, responseUrl);
    return reply(
      parsed.formId
        ? `Getting stats for \`${parsed.formId}\`…`
        : "Getting the stats. This takes about a minute…",
    );
  }
}
