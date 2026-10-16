/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Deadline sweeper, the "system" actor that fires reservation timeout, listing expiry
 *        and the pickup, delivery and confirmation timeouts, implementing the approved plan.
 * Author review: PENDING
 */
import type { Pool } from "pg";
import { SWEEPER } from "../config";
import { inTransaction } from "../db";
import { TRANSITIONS, type Action } from "../domain/transitions";
import { applyTransitionInTx } from "../errands/repository";
import { errorMessage, log } from "../log";

export type SweepCounts = Record<
  "reservationTimeout" | "expire" | "pickupTimeout" | "deliveryTimeout" | "confirmTimeout",
  number
>;

// Every system rule with a deadline, taken from the transition table
const SYSTEM_ACTIONS = (Object.keys(TRANSITIONS) as Action[]).filter(
  (a) => TRANSITIONS[a].party === "system" && TRANSITIONS[a].deadline?.mustHavePassed,
) as (keyof SweepCounts)[];

/**
 * One transaction: lock up to batchSize due errands (skipping rows another sweeper or request
 * holds) and transition each. Returns how many were selected and how many transitions succeeded.
 */
async function sweepBatch(pool: Pool, action: keyof SweepCounts, now: Date): Promise<{ selected: number; done: number }> {
  const rule = TRANSITIONS[action];
  const column = rule.deadline!.column; // a fixed DeadlineColumn name, never user input
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM errands WHERE state = ANY($1::errand_state[]) AND ${column} <= $2
       ORDER BY ${column} LIMIT $3 FOR UPDATE SKIP LOCKED`,
      [rule.from, now, SWEEPER.batchSize],
    );
    let done = 0;
    for (const { id } of rows) {
      const result = await applyTransitionInTx(client, id, action, { kind: "system" }, { now });
      if (result.ok) done++;
    }
    return { selected: rows.length, done };
  });
}

/** Fires every due system transition once; returns how many succeeded per action. */
export async function sweepDeadlines(pool: Pool, now: Date = new Date()): Promise<SweepCounts> {
  const counts: SweepCounts = { reservationTimeout: 0, expire: 0, pickupTimeout: 0, deliveryTimeout: 0, confirmTimeout: 0 };
  for (const action of SYSTEM_ACTIONS) {
    for (;;) {
      const { selected, done } = await sweepBatch(pool, action, now);
      counts[action] += done;
      // A short batch means nothing due is left; a batch where nothing succeeded would repeat forever
      if (selected < SWEEPER.batchSize || done === 0) break;
    }
  }
  return counts;
}

/** Runs sweepDeadlines every SWEEPER.intervalMs, never overlapping; stop() waits for a running sweep. */
export function startDeadlineSweeper(pool: Pool): { stop(): Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = (): void => {
    running = (async () => {
      try {
        const counts = await sweepDeadlines(pool);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total > 0) log.info("deadline_sweep", counts);
      } catch (err) {
        log.error("deadline_sweep_failed", { error: errorMessage(err) });
      }
      // Scheduled only after the sweep ends, so sweeps cannot overlap
      if (!stopped) timer = setTimeout(tick, SWEEPER.intervalMs);
    })();
  };
  timer = setTimeout(tick, SWEEPER.intervalMs);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
