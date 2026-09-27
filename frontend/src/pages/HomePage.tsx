/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Placeholder landing page after login (author decision: "authenticated (WIP)").
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useAuth } from '../auth/authContext'
import { TopBar } from '../components/TopBar'

// Temporary landing page. Replace with the supplier list once it exists.
export function HomePage() {
  const { user } = useAuth()
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-navy-900">You are authenticated (WIP)</h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as <span className="font-medium">{user?.displayName}</span>. Supplier pages are coming soon.
          </p>
        </div>
      </main>
    </>
  )
}
