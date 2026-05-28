'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import { createClient } from '@/lib/supabase'

const FIELDS = [
  { label: 'Your name', field: 'name' as const, type: 'text', autocomplete: 'name' },
  { label: 'Work email', field: 'email' as const, type: 'email', autocomplete: 'email' },
  { label: 'Password', field: 'password' as const, type: 'password', autocomplete: 'new-password' },
  { label: 'Company name', field: 'orgName' as const, type: 'text', autocomplete: 'organization' },
]

export default function SignUpPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', orgName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/api/auth/register', form)

      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      router.push('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
      setLoading(false)
    }
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
            Create your account
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Get your AI team set up in minutes
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {FIELDS.map(({ label, field, type, autocomplete }) => (
            <div key={field} className="space-y-1">
              <label
                className="block text-xs font-mono tracking-widest uppercase"
                style={{ color: 'var(--text-muted)' }}
              >
                {label}
              </label>
              <input
                type={type}
                value={form[field]}
                onChange={set(field)}
                required
                autoComplete={autocomplete}
                className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
          ))}

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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  )
}
