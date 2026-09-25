import { pool } from "./db";
import { createAccount, ValidationError, ConflictError } from "./accounts";

// Any fixed number, shared by every instance of this service
const BOOTSTRAP_LOCK_ID = 3219001;

export async function bootstrapFirstAdmin(): Promise<void> {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const provided = [username, email, password].filter(Boolean).length;
  if (provided === 0) {
    console.log("Admin bootstrap: not configured, skipping");
    return;
  }
  if (provided < 3) {
    throw new Error("Admin bootstrap: set all of BOOTSTRAP_ADMIN_USERNAME, _EMAIL and _PASSWORD, or none");
  }

  // The advisory lock makes check-then-create atomic across instances: if two
  // replicas start at once, the second waits here, then sees the admin and skips.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [BOOTSTRAP_LOCK_ID]);

    const existing = await client.query("SELECT 1 FROM users WHERE role = 'ADMINISTRATOR' LIMIT 1");
    if ((existing.rowCount ?? 0) > 0) {
      console.log("Admin bootstrap: an administrator already exists, skipping");  // US-F5.3
      return;
    }

    const admin = await createAccount({ username, email, password, role: "ADMINISTRATOR" });
    console.log(`Admin bootstrap: created first administrator '${admin.username}'`);  // never log the password
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new Error(`Admin bootstrap: invalid settings ${JSON.stringify(err.details)}`);
    }
    if (err instanceof ConflictError) {
      throw new Error(`Admin bootstrap: ${err.code}. An existing account already uses that username or email`);
    }
    throw err;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_LOCK_ID]);
    client.release();
  }
}
