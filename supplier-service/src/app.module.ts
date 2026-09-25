/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: wired the Supplier backend foundation and readiness endpoint.
 * Author review: Reviewed and approved by @ron.
 */
import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
