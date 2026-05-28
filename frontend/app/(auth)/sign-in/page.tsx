'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/admin/dashboard')
  }

  return (
    <div
      className="h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <span
            className="text-xs font-mono tracking-widest uppercase"
            style={{ color: 'var(--accent)' }}
          >
            HumanTouch
          </span>
          <h1
            className="mt-3 text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Sign in
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Welcome back to your AI team
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label
              className="block text-xs font-mono tracking-widest uppercase"
              style={{ color: 'var(--text-muted)' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div className="space-y-1">
            <label
              className="block text-xs font-mono tracking-widest uppercase"
              style={{ color: 'var(--text-muted)' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none transition-colors"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <p className="text-xs font-mono" style={{ color: 'var(--error)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 text-sm font-medium transition-colors disabled:opacity-40"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '4px',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link
            href="/sign-up"
            className="transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            Create one →
          </Link>
        </p>
      </div>
    </div>
  )
}
