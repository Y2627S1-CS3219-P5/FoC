/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: App-wide login state, login/logout, and the author's expiry-warning behaviour
 *        (toast at 5 min and 2 min before expiry; on expiry, back to login with a message).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setUnauthorizedHandler } from '../api/client'
import * as userApi from '../api/userApi'
import { useToast } from '../components/toast/toastContext'
import { AuthContext, type AuthStatus } from './authContext'
import { getTokenExpiryMs } from './tokenExpiry'
import { clearToken, getToken, saveToken } from './tokenStorage'

const MINUTE_MS = 60 * 1000
const GENTLE_NOTICE_BEFORE_MS = 5 * MINUTE_MS // author decision
const WARNING_NOTICE_BEFORE_MS = 2 * MINUTE_MS // author decision

// Message for the login page, passed via navigation "state" (used by the register page)
export interface LoginPageState {
  notice?: string
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast()

  // If a token is already saved (e.g. after a refresh), start in 'checking'
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'checking' : 'loggedOut'))
  const [user, setUser] = useState<userApi.CurrentUser | null>(null)
  // Copy of the token kept in React state, so the expiry timers below restart when it changes
  const [token, setToken] = useState<string | null>(() => getToken())
  // Why the user was logged out, shown on the login page ("You have been logged out.", ...)
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * Forget everything, optionally remembering a message for the login page.
   * No explicit navigation here: once status is 'loggedOut', <RequireAuth> sends the
   * user to /login. (Navigating here as well made two redirects race, and the one
   * without the message could win.)
   */
  const endSession = useCallback((message?: string) => {
    clearToken()
    setToken(null)
    setUser(null)
    setStatus('loggedOut')
    setNotice(message ?? null)
  }, [])

  const logout = useCallback(() => endSession('You have been logged out.'), [endSession])

  const login = useCallback(async (identifier: string, password: string) => {
    const newToken = await userApi.login(identifier, password)
    saveToken(newToken) // must be saved first: whoami() reads it from storage
    let me: userApi.CurrentUser
    try {
      me = await userApi.whoami()
    } catch (error) {
      clearToken() // don't leave a half-finished login behind
      throw error
    }
    setToken(newToken)
    setUser(me)
    setNotice(null)
    setStatus('loggedIn')
  }, [])

  // Any logged-in request that comes back 401 (expired, suspended, ...) ends the session
  useEffect(() => {
    setUnauthorizedHandler(() => endSession('Your session has ended. Please log in again.'))
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  // On page load with a saved token: ask the server who we are (also proves the token still works)
  useEffect(() => {
    if (status !== 'checking') return
    let cancelled = false
    userApi
      .whoami()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('loggedIn')
      })
      .catch(() => {
        // 401s are already handled by the unauthorized handler; for anything else
        // (e.g. server unreachable) fall back to logged out
        if (cancelled) return
        clearToken()
        setToken(null)
        setStatus('loggedOut')
      })
    return () => {
      cancelled = true
    }
  }, [status])

  // Expiry warnings. Runs whenever the token changes; timers are cleared on logout.
  useEffect(() => {
    if (!token || status !== 'loggedIn') return
    const expiresAt = getTokenExpiryMs(token)
    if (expiresAt === null) return

    const timers: ReturnType<typeof setTimeout>[] = []
    const msLeft = expiresAt - Date.now()

    const gentle = () => showToast('Heads up: your session expires in about 5 minutes.', 'info')
    const warning = () => showToast('Your session expires in 2 minutes. Save your work; you will need to log in again.', 'warning')

    // Schedule the notices that are still in the future. If we are already inside a
    // window (e.g. the page was refreshed 3 minutes before expiry), show it right away.
    if (msLeft > GENTLE_NOTICE_BEFORE_MS) {
      timers.push(setTimeout(gentle, msLeft - GENTLE_NOTICE_BEFORE_MS))
    } else if (msLeft > WARNING_NOTICE_BEFORE_MS) {
      gentle()
    }
    if (msLeft > WARNING_NOTICE_BEFORE_MS) {
      timers.push(setTimeout(warning, msLeft - WARNING_NOTICE_BEFORE_MS))
    } else if (msLeft > 0) {
      warning()
    }
    timers.push(setTimeout(() => endSession('Your session expired. Please log in again.'), Math.max(msLeft, 0)))

    return () => timers.forEach(clearTimeout)
  }, [token, status, showToast, endSession])

  const api = useMemo(() => ({ status, user, notice, login, logout }), [status, user, notice, login, logout])
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
