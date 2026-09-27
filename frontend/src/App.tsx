/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Page routes for the author's D2 auth scope (login, register, WIP landing page).
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: added
 * protected Supplier administrator routes for issue #30.
 * Author review: Pending project-author review.
 */
import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './components/RequireAuth'
import { RedirectIfLoggedIn } from './components/RedirectIfLoggedIn'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SupplierAdminPage } from './suppliers/admin/SupplierAdminPage'
import { SupplierFormPage } from './suppliers/admin/SupplierFormPage'

// URL -> page table. Supplier pages can be added here later, wrapped in <RequireAuth>.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfLoggedIn><LoginPage /></RedirectIfLoggedIn>} />
      <Route path="/register" element={<RedirectIfLoggedIn><RegisterPage /></RedirectIfLoggedIn>} />
      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/suppliers/admin" element={<RequireAuth><SupplierAdminPage /></RequireAuth>} />
      <Route path="/suppliers/new" element={<RequireAuth><SupplierFormPage mode="create" /></RequireAuth>} />
      <Route path="/suppliers/:id/edit" element={<RequireAuth><SupplierFormPage mode="edit" /></RequireAuth>} />
      {/* Any unknown URL goes to the landing page (which sends logged-out users to /login) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
