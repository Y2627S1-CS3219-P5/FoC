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
