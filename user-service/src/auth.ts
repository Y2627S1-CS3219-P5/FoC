import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { signAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "./token";
import { createAccount, ValidationError, ConflictError, BCRYPT_COST } from "./accounts";

export const authRouter = Router();

authRouter.post("/register", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  try {
    // Role is fixed by the server and never read from the request (US-F4.1.1)
    const account = await createAccount({
      username: body.username,
      email: body.email,
      password: body.password,
      role: "MEMBER",
    });
    res.status(201).json(account);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details: err.details });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: err.code,
        message: err.code === "EMAIL_TAKEN" ? "Email is already registered" : "Username is taken",
      });
      return;
    }
    throw err;
  }
});

// Hash of a throwaway string. Unknown usernames are still compared against it, so a
// "no such user" response takes as long as a "wrong password" one.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-just-for-timing", BCRYPT_COST);

authRouter.post("/login", async (req: Request, res: Response) => {
  const { identifier, password } = req.body ?? {};
  if (typeof identifier !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "identifier and password are required" });
    return;
  }

  // Usernames cannot contain '@', so an identifier can never match one account's
  // username and another account's email at the same time
  const result = await pool.query(
    `SELECT id, password_hash, status FROM users
     WHERE lower(username) = lower($1) OR email = lower($1)`,
    [identifier],
  );
  const user = result.rows[0];

  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  // US-F3.1.1: one generic answer for unknown user, wrong password or closed account
  if (!user || !passwordOk || user.status === "CLOSED") {
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid username/email or password" });
    return;
  }

  // US-F3.1.2: status is revealed only after the password was correct
  if (user.status === "PENDING_VERIFICATION" || user.status === "SUSPENDED") {
    res.status(403).json({
      error: `ACCOUNT_${user.status}`,
      message: user.status === "SUSPENDED"
        ? "This account is suspended"
        : "Please verify your email before logging in",
    });
    return;
  }

  res.json({
    accessToken: signAccessToken(user.id),
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
});

// Called by other services, forwarding the frontend's Authorization header unchanged.
authRouter.get("/verify", async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Missing bearer token" });
    return;
  }

  const userId = verifyAccessToken(token);
  if (!userId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Invalid or expired token" });
    return;
  }

  // Live lookup on every call: role changes and suspensions apply immediately (US-F4.1.4)
  const result = await pool.query(
    "SELECT id, role, status FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0];
  if (!user || user.status !== "ACTIVE") {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Account is not active" });
    return;
  }

  res.json({ id: user.id, role: user.role });
});
