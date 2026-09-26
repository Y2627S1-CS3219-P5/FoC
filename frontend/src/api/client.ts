/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Shared HTTP helper for calling backend services through the gateway.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { API_BASE } from '../config'
import { getToken } from '../auth/tokenStorage'

// Error thrown for any non-2xx response, carrying what the backend sent back.
// The backends reply with JSON like: { "error": "USERNAME_TAKEN", "message": "Username is taken" }
// (Supplier uses "code" instead of "error"; both are handled.)
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, string>

  constructor(status: number, code: string, message: string, details: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// Thrown when the server could not be reached at all (server down, no network, ...)
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach the server. Please check your connection and try again.")
  }
}

// Set by AuthProvider: what to do when a logged-in request gets a 401.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Attach the logged-in user's token. Default true. Login/register pass false. */
  auth?: boolean
  headers?: Record<string, string>
}

/**
 * Call the backend. `path` is relative to /api/v1, e.g. apiRequest('/whoami').
 * Resolves with the parsed JSON body; throws ApiError or NetworkError otherwise.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {} } = options

  const requestHeaders: Record<string, string> = { ...headers }
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (token) requestHeaders['Authorization'] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }

  // Some successful responses have no body (e.g. 204 No Content)
  const text = await response.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && onUnauthorized) onUnauthorized()
    throw toApiError(response.status, data)
  }
  return data as T
}

function toApiError(status: number, data: unknown): ApiError {
  const body = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const code = typeof body.error === 'string' ? body.error : typeof body.code === 'string' ? body.code : 'UNKNOWN'
  const message = typeof body.message === 'string' ? body.message : 'Something went wrong. Please try again.'
  const detailsSource = body.details ?? body.fieldErrors
  const details = typeof detailsSource === 'object' && detailsSource !== null ? (detailsSource as Record<string, string>) : {}
  return new ApiError(status, code, message, details)
}
