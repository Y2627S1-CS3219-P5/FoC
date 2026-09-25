/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: bootstrapped the NestJS/Express Supplier backend.
 * Author review required before submission.
 */
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { getPort } from "./config/environment";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(getPort(), "0.0.0.0");
}

void bootstrap();
