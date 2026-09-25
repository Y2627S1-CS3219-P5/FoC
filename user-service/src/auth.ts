import { signAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "./token";
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";
import { pool } from "./db";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase();
if (!ALLOWED_EMAIL_DOMAIN) {
  throw new Error("ALLOWED_EMAIL_DOMAIN is not set");
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;             // US-F1.1.2
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const BCRYPT_COST = 12;                                 // 2^12 rounds: deliberately slow

export const authRouter = Router();


// This function satisfies US-F1.1.3
function isStrongPassword(p: unknown): boolean {    
  return typeof p === "string" && p.length >= 12 &&
    /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p);
}

// Returns field -> message for every invalid field (empty object if all valid)
function validateRegistration(body: any): Record<string, string> {
  const errors: Record<string, string> = {};
  const { username, email, password } = body ?? {};

  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    errors.username = "3-30 characters: letters, digits and underscores only";
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    errors.email = "Must be a valid email address";
  } else if (email.split("@")[1].toLowerCase() !== ALLOWED_EMAIL_DOMAIN) {
    errors.email = `Must be an @${ALLOWED_EMAIL_DOMAIN} address`;  // US-F2.1
  }
  if (!isStrongPassword(password)) {
    errors.password = "At least 12 characters, with an uppercase letter, a lowercase letter and a digit";
  }
  return errors;
}

authRouter.post("/register", async (req: Request, res: Response) => {
  const errors = validateRegistration(req.body);
  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details: errors });
    return;
  }

  const username: string = req.body.username;
  const email: string = req.body.email.toLowerCase();    // US-F2.3.1: case-insensitive
  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);

  try {
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, username, email, display_name, role, status`,
      [username, email, passwordHash, username],          // display name defaults to username
    );
    const u = result.rows[0];
    res.status(201).json({
      id: u.id, username: u.username, email: u.email,
      displayName: u.display_name, role: u.role, status: u.status,
    });
  } catch (err) {
    // 23505 = unique_violation: the DB constraint caught a duplicate
    if (err instanceof DatabaseError && err.code === "23505") {
      const emailTaken = err.constraint === "users_email_key";
      res.status(409).json({
        error: emailTaken ? "EMAIL_TAKEN" : "USERNAME_TAKEN",
        message: emailTaken ? "Email is already registered" : "Username is taken",
      });
      return;
    }
    throw err; // anything else goes to the error handler in index.ts
  }
});

// Hash of a throwaway string. Unknown usernames are still compared against it, so a
// "no such user" response takes as long as a "wrong password" one. Otherwise response
// time would reveal which usernames exist.
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
