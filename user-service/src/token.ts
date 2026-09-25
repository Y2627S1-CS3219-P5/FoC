import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("JWT_SECRET is not set");
}

// We do this for TypeScript narrowing limit purposes
const JWT_SECRET: string = secret; 

export const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_ACCESS_TOKEN_TTL) || 1800;

// Payload is only the account id (sub) plus iat/exp. Role is deliberately NOT included:
// /auth/verify reads the current role from the DB, so a token can never carry a stale role.
export function signAccessToken(userId: string): string {
  return jwt.sign({}, JWT_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

// Returns the account id if the token's signature and expiry are valid, otherwise null.
// algorithms is pinned to HS256 so a token claiming "alg: none" (no signature) is rejected.
export function verifyAccessToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      return null;
    }
    return payload.sub;
  } catch {
    return null; // bad signature, expired, malformed: all treated the same
  }
}
