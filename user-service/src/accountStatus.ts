/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Implemented the author's suspend/restore rules (US-F8.2, 8.2.2, 8.2.3) with an
 *        audit entry in the same transaction (US-NFR1.1.2).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { AppendedEntry, appendAudit } from "./audit";
import { InvalidStatusTransitionError, runAdminAction } from "./roles";

export class SelfSuspendError extends Error {} // -> 403

export interface StatusChangeResult {
  id: string;
  username: string;
  displayName: string;
  status: string;
}

type StatusAction = "suspend" | "restore";

// The author's status table. A repeat is a harmless success with no audit entry, even if
// the request carries a new reason (adding evidence would be a separate action).
const RULES: Record<StatusAction, { from: string; to: string; audit: "ACCOUNT_SUSPENDED" | "ACCOUNT_RESTORED" }> = {
  suspend: { from: "ACTIVE", to: "SUSPENDED", audit: "ACCOUNT_SUSPENDED" },
  restore: { from: "SUSPENDED", to: "ACTIVE", audit: "ACCOUNT_RESTORED" },
};

/**
 * Suspension takes effect immediately for existing sessions (US-F8.2.1): `authenticate`
 * re-reads the status on every request and rejects non-ACTIVE accounts.
 */
export async function changeAccountStatus(
  action: StatusAction,
  actorId: string,
  targetId: string,
  reason: string,
): Promise<StatusChangeResult> {
  // US-F8.2.3 (also enforced by the audit table's actor <> target CHECK)
  if (action === "suspend" && actorId === targetId) throw new SelfSuspendError();
  const rule = RULES[action];

  return runAdminAction(actorId, targetId, async (client, t) => {
    let appended: AppendedEntry | undefined;
    if (t.status === rule.from) {
      await client.query("UPDATE users SET status = $1, updated_at = now() WHERE id = $2", [rule.to, targetId]);
      appended = await appendAudit(client, {
        actorType: "USER", actorId, action: rule.audit, targetId,
        previousValue: rule.from, newValue: rule.to, reason,
      });
      t.status = rule.to;
    } else if (t.status !== rule.to) {
      // PENDING_VERIFICATION or CLOSED
      throw new InvalidStatusTransitionError();
    }
    return {
      result: { id: t.id, username: t.username, displayName: t.display_name, status: t.status },
      appended,
    };
  });
}
