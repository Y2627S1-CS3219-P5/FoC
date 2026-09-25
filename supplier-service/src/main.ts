/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: bootstrapped the NestJS/Express Supplier backend.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; served bundled
 * Supplier assets and installed server-owned request/error handling for issue
 * #17. Author review of additional changes: Required before merge.
 */
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import {
  getPort,
  getSupplierImageDirectory,
} from "./config/environment";
import { assignServerRequestId } from "./http/request-id";
import { SupplierHttpExceptionFilter } from "./http/supplier-http-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(assignServerRequestId);
  app.useGlobalFilters(new SupplierHttpExceptionFilter());
  app.useStaticAssets(getSupplierImageDirectory(), {
    prefix: "/assets/suppliers/",
  });
  app.enableShutdownHooks();
  await app.listen(getPort(), "0.0.0.0");
}

void bootstrap();
