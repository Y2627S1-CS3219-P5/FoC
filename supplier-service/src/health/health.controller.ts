/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: exposed the Supplier container readiness endpoint.
 * Author review required before submission.
 */
import { Controller, Get } from "@nestjs/common";

import { HealthResponse, HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  getHealth(): Promise<HealthResponse> {
    return this.health.getReadiness();
  }
}
