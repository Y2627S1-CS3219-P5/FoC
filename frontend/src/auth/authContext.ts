/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Shape of the app-wide auth state and the useAuth() hook.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { createContext, useContext } from 'react'
import type { CurrentUser } from '../api/userApi'

// 'checking' = page just loaded and we are asking the server whether the saved token is still good
export type AuthStatus = 'checking' | 'loggedOut' | 'loggedIn'

export interface AuthApi {
  status: AuthStatus
  /** The logged-in user, or null when not logged in */
  user: CurrentUser | null
  /** Why the last session ended (logout, expiry, ...), for the login page to show */
  notice: string | null
  /** Throws ApiError / NetworkError on failure so the login form can show the message */
  login: (identifier: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthApi | null>(null)

/** Use inside any component: const { user, logout } = useAuth() */
export function useAuth(): AuthApi {
  const api = useContext(AuthContext)
  if (!api) throw new Error('useAuth must be used inside <AuthProvider>')
  return api
}
