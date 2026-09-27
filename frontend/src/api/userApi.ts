/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Typed wrappers for the User Service endpoints used by the auth pages.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { apiRequest } from './client'

export type Role = 'MEMBER' | 'ADMINISTRATOR'

// Shape of GET /api/v1/whoami (author decision: exactly these three fields)
export interface CurrentUser {
  username: string
  displayName: string
  role: Role
}

interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export function register(username: string, email: string, password: string): Promise<unknown> {
  return apiRequest('/auth/register', { method: 'POST', body: { username, email, password }, auth: false })
}

/** Returns the access token. `identifier` is a username or an email address. */
export async function login(identifier: string, password: string): Promise<string> {
  const result = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    auth: false,
  })
  return result.accessToken
}

export function whoami(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/whoami')
}
