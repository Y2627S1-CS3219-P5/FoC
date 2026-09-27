/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Implemented GET /whoami and PATCH /whoami as specified by the author
 *        (view own profile; change own displayName only, other fields ignored).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { pool } from "./db";
import { authenticate, currentUser } from "./authenticate";

export const profileRouter = Router();

const DISPLAY_NAME_MAX = 50; // US-F7.1.2

// The caller's own profile (US-F7.1).
profileRouter.get("/whoami", authenticate, (req: Request, res: Response) => {
  const user = currentUser(res);
  res.json({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });
});

// Only displayName can be changed; other fields are never read, and a body without
// displayName is a no-op. The account is always the caller's own (US-F7.1.1).
profileRouter.patch("/whoami", authenticate, async (req: Request, res: Response) => {
  const user = currentUser(res);
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};

  if (!("displayName" in body)) {
    res.json({ username: user.username, displayName: user.displayName, role: user.role });
    return;
  }

  const raw = body.displayName;
  const displayName = typeof raw === "string" ? raw.trim() : undefined;
  if (displayName === undefined || displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Some fields are invalid",
      details: { displayName: `Must be 1-${DISPLAY_NAME_MAX} characters` },
    });
    return;
  }

  const result = await pool.query(
    `UPDATE users SET display_name = $1, updated_at = now()
     WHERE id = $2
     RETURNING username, display_name, role`,
    [displayName, user.id],
  );
  const updated = result.rows[0];
  res.json({ username: updated.username, displayName: updated.display_name, role: updated.role });
});
