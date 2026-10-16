/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: SessionVerifier interface (the Order Service's only view of User Service sessions) and a
 *        stub that trusts `Bearer stub.<uuid>.<role>` tokens, implementing the approved plan.
 * Author review: PENDING
 */
export interface Principal {
  id: string;
  role: "MEMBER" | "ADMINISTRATOR";
}

export interface SessionVerifier {
  /** The caller for an Authorization header value, or null if it isn't valid. */
  verify(authorization: string | undefined): Promise<Principal | null>;
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
