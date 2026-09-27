/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused tests for response metadata, Supplier errors, and the
 * existing global unauthorised flow in issue #28.
 * Author review: Reviewed and approved by @ron.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToken, saveToken } from '../auth/tokenStorage'
import { ApiError, apiRequest, apiRequestWithMeta, setUnauthorizedHandler } from './client'

describe('API client', () => {
  beforeEach(() => {
    clearToken()
    setUnauthorizedHandler(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('retains response status and headers without changing body-only calls', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 'supplier-1' }, 201, { ETag: '"v0"' }))
      .mockResolvedValueOnce(jsonResponse({ username: 'member' }))

    const metadata = await apiRequestWithMeta<{ id: string }>('/suppliers', { method: 'POST' })
    const body = await apiRequest<{ username: string }>('/whoami')

    expect(metadata.data).toEqual({ id: 'supplier-1' })
    expect(metadata.status).toBe(201)
    expect(metadata.headers.get('ETag')).toBe('"v0"')
    expect(body).toEqual({ username: 'member' })
  })

  it('retains Supplier field errors, request IDs, and duplicate identifiers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          code: 'SUPPLIER_ALREADY_EXISTS',
          message: 'A Supplier already exists at this location.',
          fieldErrors: { name: 'Name is required.' },
          existingSupplierId: 'existing-id',
          requestId: 'request-id',
        },
        409,
      ),
    )

    const error = await apiRequest('/suppliers').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'SUPPLIER_ALREADY_EXISTS',
      details: { name: 'Name is required.' },
      fieldErrors: { name: 'Name is required.' },
      existingSupplierId: 'existing-id',
      requestId: 'request-id',
    })
  })

  it('preserves the existing logged-in 401 handler', async () => {
    saveToken('member-token')
    const handleUnauthorized = vi.fn()
    setUnauthorizedHandler(handleUnauthorized)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'UNAUTHENTICATED', message: 'Expired.' }, 401))

    await expect(apiRequest('/suppliers')).rejects.toBeInstanceOf(ApiError)

    expect(handleUnauthorized).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/suppliers',
      expect.objectContaining({ headers: { Authorization: 'Bearer member-token' } }),
    )
  })
})

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
