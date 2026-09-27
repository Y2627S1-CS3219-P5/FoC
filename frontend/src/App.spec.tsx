/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused protected Supplier route tests for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthContext, type AuthApi } from './auth/authContext'

vi.mock('./suppliers/SupplierListPage', () => ({
  SupplierListPage: () => <h1>Supplier catalogue route</h1>,
}))
vi.mock('./suppliers/SupplierDetailPage', () => ({
  SupplierDetailPage: () => <h1>Supplier detail route</h1>,
}))

const loggedIn: AuthApi = {
  status: 'loggedIn',
  user: { username: 'member_one', displayName: 'Member One', role: 'MEMBER' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

describe('Supplier routes', () => {
  it('redirects the authenticated root route to the Supplier catalogue', async () => {
    renderApp('/', loggedIn)
    expect(await screen.findByRole('heading', { name: 'Supplier catalogue route' })).toBeInTheDocument()
  })

  it('protects Supplier detail from logged-out visitors', async () => {
    renderApp('/suppliers/supplier-id', { ...loggedIn, status: 'loggedOut', user: null })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Supplier detail route' })).not.toBeInTheDocument()
  })
})

function renderApp(path: string, auth: AuthApi) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
