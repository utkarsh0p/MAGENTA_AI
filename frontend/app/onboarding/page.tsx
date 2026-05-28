'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { api } from '@/lib/api-client'
import { readSSE } from '@/lib/sse'

type Message = { role: 'assistant' | 'user'; content: string }

const STEPS = ['Company', 'Your Role', 'Goals', 'Tone']

export default function OnboardingPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [pendingOrgContext, setPendingOrgContext] = useState<unknown>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const userMessageCount = useRef(0)

  useEffect(() => {
    runStream(true, '')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function runStream(isInitial: boolean, userMessage: string) {
    setLoading(true)

    const token = await getToken()
    if (!token) { setLoading(false); return }

    if (!isInitial) {
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    }

    const path = isInitial ? '/api/onboarding/stream' : '/api/onboarding/message'
    const init = isInitial ? undefined : { method: 'POST', body: { content: userMessage } }

    try {
      for await (const { event, data } of readSSE(path, token, init)) {
        if (event === 'onboarding_token') {
          const { content } = JSON.parse(data) as { content: string }
          setMessages((prev) => {
            const last = prev.at(-1)
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: last.content + content }]
            }
            return [...prev, { role: 'assistant', content }]
          })
        } else if (event === 'onboarding_complete') {
          const { orgContext } = JSON.parse(data) as { orgContext: unknown }
          setPendingOrgContext(orgContext)
        }
      }
    } catch {
      // stream ended or errored
    }

    if (!isInitial) {
      userMessageCount.current += 1
      setStep(Math.min(userMessageCount.current, STEPS.length - 1))
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const msg = input
    setInput('')
    await runStream(false, msg)
  }

  async function handleConfirm() {
    if (!pendingOrgContext) return
    setLoading(true)
    try {
      await api.post('/api/onboarding/complete', { orgContext: pendingOrgContext })
      router.push('/admin/dashboard')
    } catch {
      setLoading(false)
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Progress bar */}
      <div className="h-0.5 w-full" style={{ background: 'var(--bg-surface)' }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%`, background: 'var(--accent)' }}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-8 overflow-hidden">
        {/* Step header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className="text-xs font-mono tracking-widest uppercase transition-colors"
                style={{ color: i === step ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {s}
              </span>
            ))}
          </div>
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Setting up your AI team
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
        </div>

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {messages.map((m, i) => (
            <div key={i} className={`slide-up ${m.role === 'user' ? 'pl-8' : ''}`}>
              <div
                className="text-xs font-mono tracking-widest uppercase mb-1.5"
                style={{ color: m.role === 'assistant' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {m.role === 'assistant' ? 'AI' : 'You'}
              </div>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  color: m.role === 'assistant' ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && messages.at(-1)?.role !== 'assistant' && (
            <div>
              <div
                className="text-xs font-mono tracking-widest uppercase mb-1.5"
                style={{ color: 'var(--accent)' }}
              >
                AI
              </div>
              <div className="flex gap-1 items-center" style={{ color: 'var(--text-muted)' }}>
                <span className="text-sm font-mono">
                  <span className="inline-block animate-pulse">▋</span>
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div
          className="mt-6 pt-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {pendingOrgContext ? (
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full py-3 text-sm font-medium transition-colors disabled:opacity-40"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '4px',
              }}
            >
              {loading ? 'Launching your AI team…' : 'Confirm & launch my AI team →'}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Type your reply…"
                disabled={loading}
                className="flex-1 bg-transparent py-2 text-sm focus:outline-none disabled:opacity-40"
                style={{
                  color: 'var(--text-primary)',
                  caretColor: 'var(--accent)',
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="text-sm font-mono px-3 py-1.5 transition-colors disabled:opacity-30"
                style={{
                  color: loading || !input.trim() ? 'var(--text-muted)' : 'var(--accent)',
                }}
              >
                ↵
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
