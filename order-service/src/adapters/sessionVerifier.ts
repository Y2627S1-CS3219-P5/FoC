/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: SessionVerifier interface (the Order Service's only view of User Service sessions) and a
 *        stub that trusts `Bearer stub.<uuid>.<role>` tokens, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: UserServiceSessionVerifier, which asks User Service's GET /auth/verify (bounded and
 *        fail-closed, like supplier-service's verifier), so real credit operations are never
 *        triggered by a forged stub identity.
 * Author review of additional changes: Reviewed and approved by @phuc
 */
export interface Principal {
  id: string;
  role: "MEMBER" | "ADMINISTRATOR";
}

export interface SessionVerifier {
  /**
   * The caller for an Authorization header value, or null if it isn't valid. Throws
   * SessionVerificationUnavailableError when validity can't be decided (answered with 503).
   */
  verify(authorization: string | undefined): Promise<Principal | null>;
}

/** User Service could not be asked, or gave an unusable answer. Never treated as logged out. */
export class SessionVerificationUnavailableError extends Error {
  constructor() {
    super("session verification unavailable");
  }
}

const STUB_TOKEN = /^Bearer stub\.([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.(MEMBER|ADMINISTRATOR)$/;

/** Accepts exactly `Bearer stub.<uuid>.<MEMBER|ADMINISTRATOR>`; anything else gives null. */
export class StubSessionVerifier implements SessionVerifier {
  async verify(authorization: string | undefined): Promise<Principal | null> {
    const m = authorization === undefined ? null : STUB_TOKEN.exec(authorization);
    // Everything is case-sensitive except the UUID digits
    if (m === null) return null;
    return { id: m[1].toLowerCase(), role: m[2] as Principal["role"] };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePrincipal(body: unknown): Principal {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new SessionVerificationUnavailableError();
  const { id, role } = body as { id?: unknown; role?: unknown };
  if (typeof id !== "string" || !UUID_RE.test(id) || (role !== "MEMBER" && role !== "ADMINISTRATOR")) {
    throw new SessionVerificationUnavailableError();
  }
  return { id: id.toLowerCase(), role };
}

/**
 * Asks User Service's GET /auth/verify, forwarding the caller's Authorization header unchanged.
 * 401 means not logged in (null). Anything else that isn't a well-formed 200 (timeout, network
 * error, 5xx, a redirect, a malformed body) throws SessionVerificationUnavailableError: the
 * request fails with 503 and nobody is let in.
 */
export class UserServiceSessionVerifier implements SessionVerifier {
  private readonly verifyUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    config: { baseUrl: string; timeoutMs: number },
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.verifyUrl = new URL("/auth/verify", config.baseUrl);
    this.timeoutMs = config.timeoutMs;
  }

  async verify(authorization: string | undefined): Promise<Principal | null> {
    // No credentials: nothing to ask User Service about
    if (authorization === undefined || authorization === "") return null;
    let response: Response;
    try {
      response = await this.fetchImpl(this.verifyUrl, {
        method: "GET",
        redirect: "error",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new SessionVerificationUnavailableError();
    }
    if (response.status === 401) return null;
    if (!response.ok) throw new SessionVerificationUnavailableError();
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SessionVerificationUnavailableError();
    }
    return parsePrincipal(body);
  }
}
