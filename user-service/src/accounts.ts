import bcrypt from "bcryptjs";
import { DatabaseError } from "pg";
import { pool } from "./db";

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase();
if (!ALLOWED_EMAIL_DOMAIN) {
  throw new Error("ALLOWED_EMAIL_DOMAIN is not set");
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;             // US-F1.1.2
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
export const BCRYPT_COST = 12;

export type Role = "MEMBER" | "ADMINISTRATOR";

export interface Account {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: Role;
  status: string;
}

// Fields are `unknown` because they may come straight from a request body
export interface NewAccountInput {
  username: unknown;
  email: unknown;
  password: unknown;
  role: Role;
}

export class ValidationError extends Error {
  readonly details: Record<string, string>;
  constructor(details: Record<string, string>) {
    super("Validation failed");
    this.details = details;
  }
}

export class ConflictError extends Error {
  readonly code: "USERNAME_TAKEN" | "EMAIL_TAKEN";
  constructor(code: "USERNAME_TAKEN" | "EMAIL_TAKEN") {
    super(code);
    this.code = code;
  }
}

function isStrongPassword(p: unknown): boolean {        // US-F1.1.3
  return typeof p === "string" && p.length >= 12 &&
    /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p);
}

function validate(input: NewAccountInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const { username, email, password } = input;

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

// The single place accounts are created: used by registration and by the admin bootstrap
export async function createAccount(input: NewAccountInput): Promise<Account> {
  const errors = validate(input);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }

  const username = input.username as string;              // safe: validated above
  const email = (input.email as string).toLowerCase();    // US-F2.3.1
  const passwordHash = await bcrypt.hash(input.password as string, BCRYPT_COST);

  try {
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, role, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id, username, email, display_name, role, status`,
      [username, email, passwordHash, username, input.role],
    );
    const u = result.rows[0];
    return {
      id: u.id, username: u.username, email: u.email,
      displayName: u.display_name, role: u.role, status: u.status,
    };
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "23505") {
      throw new ConflictError(err.constraint === "users_email_key" ? "EMAIL_TAKEN" : "USERNAME_TAKEN");
    }
    throw err;
  }
}
