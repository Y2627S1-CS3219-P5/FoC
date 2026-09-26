/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Admin-only HTTP route for role changes, mapping the rules in roles.ts to the
 *        author's status codes.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { authenticate, currentUser, requireRole } from "./authenticate";
import { Role } from "./accounts";
import {
  changeRole,
  ROLES,
  NotAllowedError,
  OwnRoleError,
  UserNotFoundError,
  LastAdministratorError,
} from "./roles";

export const usersRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public path: PUT /api/v1/users/{id}/role, body { role }
usersRouter.put(
  "/users/:id/role",
  authenticate,
  requireRole("ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const role = req.body?.role;

    if (!ROLES.includes(role)) {
      res.status(400).json({
        error: "VALIDATION_FAILED",
        message: "Some fields are invalid",
        details: { role: "Must be MEMBER or ADMINISTRATOR" },
      });
      return;
    }
    if (!UUID_RE.test(targetId)) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
      return;
    }

    try {
      const updated = await changeRole(currentUser(res).id, targetId, role as Role);
      res.json(updated);
    } catch (err) {
      if (err instanceof OwnRoleError) {
        res.status(403).json({ error: "CANNOT_CHANGE_OWN_ROLE", message: "You cannot change your own role" });
      } else if (err instanceof NotAllowedError) {
        res.status(403).json({ error: "FORBIDDEN", message: "You do not have permission to do this" });
      } else if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
      } else if (err instanceof LastAdministratorError) {
        res.status(409).json({
          error: "LAST_ADMINISTRATOR",
          message: "This change would leave no active administrator",
        });
      } else {
        throw err;
      }
    }
  },
);
