'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'
import { getToken, clearToken } from '@/lib/auth'
import { readSSE } from '@/lib/sse'

type AgentConfig = {
  id: string
  name: string
  description: string
  agentType: 'MAIN' | 'SUBAGENT'
  prebuiltType: string | null
}

type Conversation = {
  id: string
  title: string
  threadId: string
  agentId: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

type LogEntry = { time: string; text: string }

// Positions for main agent node and up to 4 sub-agent nodes in the SVG viewBox 0 0 400 440
const MAIN_POS = { x: 200, y: 210 }
const SUB_POSITIONS = [
  { x: 80, y: 80 },
  { x: 320, y: 80 },
  { x: 80, y: 360 },
  { x: 320, y: 360 },
]

function AgentGraph({
  agents,
  selectedAgent,
  streamingAgent,
  onSelect,
}: {
  agents: AgentConfig[]
  selectedAgent: AgentConfig | null
  streamingAgent: string | null
  onSelect: (a: AgentConfig) => void
}) {
  const main = agents.find((a) => a.agentType === 'MAIN')
  const subs = agents.filter((a) => a.agentType === 'SUBAGENT')

  function isActive(id: string) {
    return selectedAgent?.id === id
  }

  function isStreaming(id: string) {
    return streamingAgent === id
  }

  function nodeColor(id: string) {
    if (isActive(id)) return 'rgba(124,92,252,0.18)'
    return '#111118'
  }

  function strokeColor(id: string) {
    if (isStreaming(id)) return '#7c5cfc'
    if (isActive(id)) return 'rgba(124,92,252,0.6)'
    return 'rgba(255,255,255,0.1)'
  }

  function labelColor(id: string) {
    if (isActive(id)) return '#e8e8f0'
    return 'rgba(232,232,240,0.45)'
  }

  function lineColor(subId: string) {
    if (isStreaming(subId) || (streamingAgent === main?.id && isActive(subId))) {
      return 'rgba(124,92,252,0.5)'
    }
    if (isActive(subId)) return 'rgba(124,92,252,0.25)'
    return 'rgba(255,255,255,0.06)'
  }

  // Wrap long names into two lines for SVG text
  function splitName(name: string): [string, string] {
    const words = name.split(' ')
    if (words.length <= 2) return [words[0], words.slice(1).join(' ')]
    const mid = Math.ceil(words.length / 2)
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
  }

  return (
    <svg
      viewBox="0 0 400 440"
      className="w-full h-full"
      style={{ overflow: 'visible' }}
    >
      {/* Connection lines */}
      {subs.map((sub, i) => {
        const pos = SUB_POSITIONS[i]
        if (!pos) return null
        const streaming = isStreaming(sub.id) || (streamingAgent === main?.id && isActive(sub.id))
        return (
          <line
            key={sub.id}
            x1={MAIN_POS.x}
            y1={MAIN_POS.y}
            x2={pos.x}
            y2={pos.y}
            stroke={lineColor(sub.id)}
            strokeWidth={streaming ? 1.5 : 1}
            strokeDasharray={streaming ? '4 4' : undefined}
            className={streaming ? 'flow-line' : undefined}
          />
        )
      })}

      {/* Sub-agent nodes */}
      {subs.map((sub, i) => {
        const pos = SUB_POSITIONS[i]
        if (!pos) return null
        const [line1, line2] = splitName(sub.name)
        const active = isActive(sub.id)
        const streaming = isStreaming(sub.id)
        return (
          <g
            key={sub.id}
            onClick={() => onSelect(sub)}
            style={{ cursor: 'pointer' }}
            className={streaming ? 'pulse-glow' : ''}
          >
            <circle
              cx={pos.x}
              cy={pos.y}
              r={32}
              fill={nodeColor(sub.id)}
              stroke={strokeColor(sub.id)}
              strokeWidth={active ? 1.5 : 1}
            />
            <text
              x={pos.x}
              y={pos.y - (line2 ? 5 : 0)}
              textAnchor="middle"
              fill={labelColor(sub.id)}
              fontSize={8}
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight={active ? '500' : '400'}
            >
              {line1}
            </text>
            {line2 && (
              <text
                x={pos.x}
                y={pos.y + 9}
                textAnchor="middle"
                fill={labelColor(sub.id)}
                fontSize={8}
                fontFamily="Inter, system-ui, sans-serif"
                fontWeight={active ? '500' : '400'}
              >
                {line2}
              </text>
            )}
          </g>
        )
      })}

      {/* Main agent node */}
      {main && (
        <g
          onClick={() => onSelect(main)}
          style={{ cursor: 'pointer' }}
          className={isStreaming(main.id) ? 'pulse-glow' : ''}
        >
          <circle
            cx={MAIN_POS.x}
            cy={MAIN_POS.y}
            r={44}
            fill={nodeColor(main.id)}
            stroke={strokeColor(main.id)}
            strokeWidth={isActive(main.id) ? 1.5 : 1}
          />
          <text
            x={MAIN_POS.x}
            y={MAIN_POS.y - 5}
            textAnchor="middle"
            fill={labelColor(main.id)}
            fontSize={9}
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={isActive(main.id) ? '600' : '400'}
          >
            Main
          </text>
          <text
            x={MAIN_POS.x}
            y={MAIN_POS.y + 9}
            textAnchor="middle"
            fill={labelColor(main.id)}
            fontSize={9}
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={isActive(main.id) ? '600' : '400'}
          >
            Agent
          </text>
        </g>
      )}
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  function addLog(text: string) {
    const time = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    setLog((l) => [...l.slice(-99), { time, text }])
  }

  useEffect(() => {
    api.get<AgentConfig[]>('/api/agents').then((data) => {
      setAgents(data)
      const main = data.find((a) => a.agentType === 'MAIN')
      if (main) setSelectedAgent(main)
    })
  }, [])

  useEffect(() => {
    if (!selectedAgent) return
    setMessages([])
    api
      .post<Conversation>('/api/conversations', { agentId: selectedAgent.id })
      .then((conv) => {
        setConversation(conv)
        return api.get<Message[]>(`/api/conversations/${conv.id}/messages`)
      })
      .then((msgs) => setMessages(msgs ?? []))
  }, [selectedAgent])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || streaming || !conversation || !selectedAgent) return
    const content = input
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }])
    setStreaming(true)
    setStreamingAgent(selectedAgent.id)
    addLog(`You → ${selectedAgent.name}  ${content.slice(0, 72)}`)

    const token = await getToken()
    if (!token) { setStreaming(false); setStreamingAgent(null); return }

    abortRef.current = new AbortController()

    try {
      for await (const { event, data } of readSSE(
        `/api/conversations/${conversation.id}/stream?content=${encodeURIComponent(content)}`,
        token
      )) {
        if (event === 'main_token' || event === 'subagent_direct_token') {
          const { content: chunk } = JSON.parse(data) as { content: string }
          setMessages((prev) => {
            const last = prev.at(-1)
            if (last?.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { role: 'assistant', content: last.content + chunk, streaming: true },
              ]
            }
            return [...prev, { role: 'assistant', content: chunk, streaming: true }]
          })
        } else if (event === 'subagent_start') {
          const { name } = JSON.parse(data) as { name: string }
          const subAgent = agents.find(
            (a) => a.prebuiltType?.toLowerCase().replace('_', '_') + '_agent' === name
          )
          if (subAgent) setStreamingAgent(subAgent.id)
          addLog(`${name.replace('_', ' ')} is working on this…`)
        } else if (event === 'subagent_token') {
          const { content: chunk } = JSON.parse(data) as { content: string }
          if (chunk.trim()) addLog(`  ↳ ${chunk.slice(0, 80)}`)
        } else if (event === 'error') {
          const { message } = JSON.parse(data) as { message: string }
          addLog(`error  ${message}`)
          break
        } else if (event === 'done') {
          break
        }
      }
    } catch {
      // aborted or network error
    }

    // Mark streaming done — switch from mono to sans font
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    )
    addLog(`${selectedAgent.name}  response complete`)
    setStreaming(false)
    setStreamingAgent(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleLogout() {
    await clearToken()
    router.push('/sign-in')
  }

  function selectAgent(agent: AgentConfig) {
    if (streaming) return
    setSelectedAgent(agent)
  }

  const mainAgent = agents.find((a) => a.agentType === 'MAIN')
  const subAgents = agents.filter((a) => a.agentType === 'SUBAGENT')

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Topbar */}
      <header
        className="h-12 flex items-center justify-between px-5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color: 'var(--accent)' }}
        >
          HumanTouch
        </span>
        <div className="flex items-center gap-4">
          {selectedAgent && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {selectedAgent.name}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Agent graph (40%) */}
        <aside
          className="w-2/5 flex flex-col overflow-hidden"
          style={{ borderRight: '1px solid var(--border)' }}
        >
          <div
            className="px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <p
              className="text-xs font-mono tracking-widest uppercase"
              style={{ color: 'var(--text-muted)' }}
            >
              Agent Network
            </p>
          </div>

          {/* SVG graph */}
          <div className="flex-1 px-4 py-2">
            {agents.length > 0 && (
              <AgentGraph
                agents={agents}
                selectedAgent={selectedAgent}
                streamingAgent={streamingAgent}
                onSelect={selectAgent}
              />
            )}
          </div>

          {/* Agent list below graph */}
          <div
            className="flex-shrink-0 px-4 pb-4 space-y-1"
            style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}
          >
            {mainAgent && (
              <button
                onClick={() => selectAgent(mainAgent)}
                className="w-full text-left px-3 py-2 transition-colors text-xs"
                style={{
                  background: selectedAgent?.id === mainAgent.id ? 'var(--accent-dim)' : 'transparent',
                  borderRadius: '4px',
                  color: selectedAgent?.id === mainAgent.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: selectedAgent?.id === mainAgent.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <span className="font-medium">{mainAgent.name}</span>
                <span
                  className="ml-2 font-mono text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  chief of staff
                </span>
              </button>
            )}
            {subAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent)}
                className="w-full text-left px-3 py-2 transition-colors text-xs"
                style={{
                  background: selectedAgent?.id === agent.id ? 'var(--accent-dim)' : 'transparent',
                  borderRadius: '4px',
                  color: selectedAgent?.id === agent.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: selectedAgent?.id === agent.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </aside>

        {/* Right: Chat + log (60%) */}
        <div className="w-3/5 flex flex-col overflow-hidden">
          {/* Chat header */}
          <div
            className="h-12 flex items-center px-5 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {selectedAgent ? (
              <>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selectedAgent.name}
                </span>
                <span
                  className="ml-3 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {selectedAgent.agentType === 'MAIN' ? 'orchestrator' : selectedAgent.prebuiltType?.toLowerCase().replace(/_/g, ' ')}
                </span>
                {streaming && (
                  <span
                    className="ml-auto text-xs font-mono"
                    style={{ color: 'var(--accent)' }}
                  >
                    ▋
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Select an agent
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {messages.length === 0 && !streaming && (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {selectedAgent
                    ? `Start a conversation with ${selectedAgent.name}`
                    : 'Select an agent to begin'}
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className="slide-up"
                style={{ paddingLeft: m.role === 'user' ? '2rem' : '0' }}
              >
                <div
                  className="text-[10px] font-mono tracking-widest uppercase mb-1"
                  style={{ color: m.role === 'assistant' ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {m.role === 'assistant' ? (selectedAgent?.name ?? 'Agent') : 'You'}
                </div>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: m.role === 'assistant' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontFamily:
                      m.role === 'assistant' && m.streaming
                        ? '"JetBrains Mono", "Fira Code", monospace'
                        : 'inherit',
                  }}
                >
                  {m.content}
                  {m.streaming && (
                    <span
                      className="animate-pulse ml-0.5"
                      style={{ color: 'var(--accent)' }}
                    >
                      ▋
                    </span>
                  )}
                </div>
              </div>
            ))}

            {streaming && messages.at(-1)?.role !== 'assistant' && (
              <div>
                <div
                  className="text-[10px] font-mono tracking-widest uppercase mb-1"
                  style={{ color: 'var(--accent)' }}
                >
                  {selectedAgent?.name ?? 'Agent'}
                </div>
                <span
                  className="animate-pulse text-sm font-mono"
                  style={{ color: 'var(--accent)' }}
                >
                  ▋
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="flex-shrink-0 px-5 py-4"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={selectedAgent ? `Message ${selectedAgent.name}…` : 'Select an agent'}
                disabled={streaming || !selectedAgent}
                className="flex-1 bg-transparent py-2 text-sm focus:outline-none disabled:opacity-30"
                style={{
                  color: 'var(--text-primary)',
                  caretColor: 'var(--accent)',
                }}
              />
              <button
                onClick={handleSend}
                disabled={streaming || !input.trim() || !selectedAgent}
                className="text-sm font-mono px-3 py-1.5 transition-colors disabled:opacity-30"
                style={{
                  color: streaming || !input.trim() ? 'var(--text-muted)' : 'var(--accent)',
                }}
              >
                ↵
              </button>
            </div>
          </div>

          {/* Activity log */}
          <div
            className="flex-shrink-0 h-36 overflow-y-auto px-5 py-3"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}
          >
            <p
              className="text-[10px] font-mono tracking-widest uppercase mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Activity
            </p>
            {log.length === 0 ? (
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                No activity yet
              </p>
            ) : (
              <div className="space-y-0.5">
                {log.map((entry, i) => (
                  <div key={i} className="flex gap-3 text-xs font-mono leading-5">
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      {entry.time}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
