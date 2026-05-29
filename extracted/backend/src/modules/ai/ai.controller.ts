import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AiService } from './ai.service';
import { AskDto, ExplainDto, SuggestDto } from './ai.dto';

/**
 * Public AI surface, kept narrow on purpose:
 *
 *   POST /api/ai/ask        ground-truthed transit question
 *   POST /api/ai/explain    plan → human paragraph
 *   POST /api/ai/suggest    1–3 alternative routes
 *
 * Throttling is per-IP (10 / minute / endpoint) — enough for
 * organic UX, low enough to make a stolen API key uneconomical.
 * The global ThrottlerGuard already covers 120 req/min/IP across
 * the whole API; the per-endpoint Throttle decorator narrows this
 * further for AI calls specifically.
 */
@UseGuards(ThrottlerGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('ask')
  @HttpCode(200)
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  ask(@Req() req: Request, @Body() body: AskDto) {
    return this.ai.ask({
      question: body.question,
      context: body.context,
      locale: body.locale ?? (req as any).locale,
    });
  }

  @Post('explain')
  @HttpCode(200)
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  explain(@Req() req: Request, @Body() body: ExplainDto) {
    return this.ai.explain({
      fromName: body.fromName,
      toName: body.toName,
      durationMinutes: body.durationMinutes,
      fareEgp: body.fareEgp,
      vehicle: body.vehicle,
      steps: body.steps,
      locale: body.locale ?? (req as any).locale,
    });
  }

  @Post('suggest')
  @HttpCode(200)
  @Throttle({ ai: { limit: 10, ttl: 60_000 } })
  suggest(@Req() req: Request, @Body() body: SuggestDto) {
    return this.ai.suggest({
      fromName: body.fromName,
      toName: body.toName,
      departAt: body.departAt,
      locale: body.locale ?? (req as any).locale,
    });
  }
}
