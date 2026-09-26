/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Implemented the author's role-change rules (admin-only, no self change,
 *        never zero ACTIVE admins, idempotent) with the author's lock-then-check
 *        concurrency approach.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { pool } from "./db";
import { Role } from "./accounts";

// Taken by every role change (see changeRole); distinct from the bootstrap lock
const ROLE_CHANGE_LOCK_ID = 3219002;

export const ROLES: readonly Role[] = ["MEMBER", "ADMINISTRATOR"];

export interface RoleChangeResult {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export class NotAllowedError extends Error {}       // -> 403
export class OwnRoleError extends Error {}          // -> 403
export class UserNotFoundError extends Error {}     // -> 404
export class LastAdministratorError extends Error {} // -> 409

/**
 * Change targetId's role on behalf of actorId, independent of how a route identifies
 * the target. Role changes are serialised with an advisory lock so that concurrent
 * changes (e.g. two admins demoting each other) cannot leave zero ACTIVE admins.
 */
export async function changeRole(actorId: string, targetId: string, newRole: Role): Promise<RoleChangeResult> {
  // US-F4.1.2: only *another* account's role
  if (actorId === targetId) throw new OwnRoleError();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Released automatically at COMMIT/ROLLBACK
    await client.query("SELECT pg_advisory_xact_lock($1)", [ROLE_CHANGE_LOCK_ID]);

    // The actor may have been demoted while waiting for the lock
    const actor = await client.query("SELECT role, status FROM users WHERE id = $1", [actorId]);
    if (actor.rows[0]?.role !== "ADMINISTRATOR" || actor.rows[0]?.status !== "ACTIVE") {
      throw new NotAllowedError();
    }

    const target = await client.query(
      "SELECT id, username, display_name, role, status FROM users WHERE id = $1",
      [targetId],
    );
    const t = target.rows[0];
    if (!t) throw new UserNotFoundError();

    // Same role: no change (idempotent)
    if (t.role !== newRole) {
      // US-F4.1.3
      if (t.role === "ADMINISTRATOR" && t.status === "ACTIVE") {
        const admins = await client.query(
          "SELECT count(*)::int AS n FROM users WHERE role = 'ADMINISTRATOR' AND status = 'ACTIVE'",
        );
        if (admins.rows[0].n <= 1) throw new LastAdministratorError();
      }
      await client.query("UPDATE users SET role = $1, updated_at = now() WHERE id = $2", [newRole, targetId]);
      t.role = newRole;
    }

    await client.query("COMMIT");
    return { id: t.id, username: t.username, displayName: t.display_name, role: t.role };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
