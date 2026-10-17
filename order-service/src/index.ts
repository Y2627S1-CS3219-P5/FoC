/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Service entry point: load the configuration, wait for the database, build the stub
 *        adapters, start the outbox publisher, deadline sweeper and HTTP server, and shut down
 *        cleanly on SIGTERM/SIGINT. Startup/shutdown pattern from credit-service/src/index.ts.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Rebuild the stub Credit holds from published outbox rows before the publisher starts.
 * Author review: Reviewed and approved by @mattis.
 */
import { StubCreditBus } from "./adapters/creditBus";
import { StubSessionVerifier } from "./adapters/sessionVerifier";
import { StubSupplierDirectory } from "./adapters/supplierDirectory";
import { loadAdapterConfig, loadDatabaseConfig, loadOrderConfig, loadServerConfig } from "./config";
import { createPool } from "./db";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";
import { startDeadlineSweeper } from "./deadlines/sweeper";
import { createApp } from "./http/app";
import { errorMessage, log } from "./log";
import { startOutboxPublisher } from "./outbox";

async function main(): Promise<void> {
  // Fail fast on bad settings, before any connection is made
  loadDatabaseConfig();
  const order = loadOrderConfig();
  const adapters = loadAdapterConfig();
  const { port } = loadServerConfig();

  const pool = createPool();
  await retryWhileDatabaseUnavailable("Startup", () => pool.query("SELECT 1"));

  // Only the stubs exist so far (loadAdapterConfig rejects any other mode)
  const verifier = new StubSessionVerifier();
  const suppliers = new StubSupplierDirectory();
  const creditBus = new StubCreditBus(pool, {
    limit: adapters.stubCreditLimit,
    delayMs: adapters.stubCreditDelayMs,
    silentAmount: adapters.stubCreditSilentAmount,
  });

  // The stub's holds live in memory; rebuild them from what was already published
  await creditBus.restore();
  const publisher = startOutboxPublisher(pool, creditBus);
  const sweeper = startDeadlineSweeper(pool);
  const server = createApp({ pool, verifier, suppliers }).listen(port, () => {
    log.info("order_service.started", {
      port,
      authMode: adapters.authMode,
      supplierMode: adapters.supplierMode,
      creditMode: adapters.creditMode,
      confirmationWindowMinutes: order.confirmationWindowMinutes,
      reservationTimeoutSeconds: order.reservationTimeoutSeconds,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("order_service.shutdown", { signal });
    // Stop taking requests first, then the background work, then the database
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
    await sweeper.stop().catch((err) => log.warn("sweeper_stop_failed", { error: errorMessage(err) }));
    await publisher.stop().catch((err) => log.warn("publisher_stop_failed", { error: errorMessage(err) }));
    await pool.end().catch((err) => log.warn("pool_end_failed", { error: errorMessage(err) }));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.error("startup_failed", { error: errorMessage(err) });
  process.exit(1);
});
