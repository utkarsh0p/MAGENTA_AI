import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { v4 as uuidv4 } from 'uuid'
import type { OrgContext } from '../prebuilt/registry.js'

const ONBOARDING_SYSTEM_PROMPT = `You are an onboarding assistant setting up an AI team for a solo founder or freelancer.
Be extremely concise — one short sentence per message, zero pleasantries.

Ask these 4 questions in order, one at a time. Do not combine them. Do not ask follow-ups.

1. "What's your company called, and what does it do?"
2. "How many people are on your team, and what's your role?"
3. "What's the main thing you want your AI team to take off your plate?"
4. "What tone should your agents use — formal, casual, or direct?"

After the 4th answer, write one sentence summarising what you understood, then ask: "Does that sound right?"

When they confirm (yes / looks good / correct / any affirmation), output ONLY this JSON block — no text before or after:
\`\`\`json
{
  "orgContext": {
    "companyName": "...",
    "industry": "...",
    "companySize": "...",
    "adminRole": "...",
    "goals": "...",
    "tone": "..."
  },
  "confirmed": true
}
\`\`\`

Rules you must never break:
- Never ask more than one question per message
- Never combine two steps
- Never say "Great!", "Sure!", "Of course!", "Absolutely!" or any filler
- Every response must be under 2 sentences until the JSON block
`

function makeModel() {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-pro',
    apiKey: process.env.GEMINI_API_KEY,
  })
}

export function createReflexiveAgent(): ReturnType<typeof createReactAgent> {
  return createReactAgent({
    llm: makeModel(),
    tools: [],
    prompt: ONBOARDING_SYSTEM_PROMPT,
  })
}

export async function* streamReflexiveResponse(
  threadMessages: { role: 'user' | 'assistant'; content: string }[],
  newUserMessage: string
) {
  const agent = createReflexiveAgent()
  const threadId = uuidv4()

  const allMessages = [
    ...threadMessages.map((m) =>
      m.role === 'user'
        ? new HumanMessage(m.content)
        : { role: 'assistant' as const, content: m.content }
    ),
    new HumanMessage(newUserMessage),
  ]

  const stream = agent.streamEvents(
    { messages: allMessages },
    { version: 'v2', configurable: { thread_id: threadId } }
  )

  for await (const event of stream) {
    if (event.event === 'on_chat_model_stream') {
      const chunk = event.data?.chunk?.content as string | undefined
      if (chunk) yield chunk
    }
  }
}

// One-shot (non-streaming) call — generates a tailored system prompt for a sub-agent
export async function generateTailoredPrompt(
  ctx: OrgContext,
  agentRole: string,
  toolkits: string[],
  templateGuidance: string
): Promise<string> {
  const model = makeModel()

  const systemMsg = new SystemMessage(
    `You write system prompts for AI agents. Be specific, practical, and concise.
Output only the system prompt text — no preamble, no explanation, no markdown fencing.`
  )

  const userMsg = new HumanMessage(
    `Write a system prompt for a ${agentRole} AI agent working at the company described below.

Company context:
- Name: ${ctx.companyName}
- Industry: ${ctx.industry}
- Team size: ${ctx.companySize}
- Admin role: ${ctx.adminRole}
- Primary goals: ${ctx.goals}
- Communication tone: ${ctx.tone}

Available tools (Composio toolkits): ${toolkits.join(', ')}

Use this template as the structural skeleton — keep the responsibilities and tool references, but rewrite the context to be specific to this company and their goals:
---
${templateGuidance}
---

Make it feel like it was written specifically for ${ctx.companyName}. Reference the company's industry, goals, and tone naturally. Keep it under 300 words.`
  )

  const response = await model.invoke([systemMsg, userMsg])
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content)
}

// One-shot call — generates the main agent (chief-of-staff) system prompt
export async function generateMainAgentPrompt(ctx: OrgContext): Promise<string> {
  const model = makeModel()

  const systemMsg = new SystemMessage(
    `You write system prompts for AI agents. Be specific, practical, and concise.
Output only the system prompt text — no preamble, no explanation, no markdown fencing.`
  )

  const userMsg = new HumanMessage(
    `Write a system prompt for a Main Agent — an AI chief-of-staff — for the company described below.

Company context:
- Name: ${ctx.companyName}
- Industry: ${ctx.industry}
- Team size: ${ctx.companySize}
- Admin role: ${ctx.adminRole}
- Primary goals: ${ctx.goals}
- Communication tone: ${ctx.tone}

The Main Agent has 4 specialist sub-agents available as tools:
- hr_agent: hiring, scheduling, onboarding, HR FAQs
- social_media_manager_agent: posts, brand presence, Twitter and Instagram
- software_engineer_agent: GitHub/GitLab, PRs, Jira, engineering coordination
- ui_ux_designer_agent: Figma, design docs, Notion, Slack

The Main Agent must:
1. Answer general knowledge and conversation questions directly from its own knowledge
2. Delegate specialist work to the appropriate sub-agent and announce it ("Delegating to HR Agent…")
3. Never call external APIs directly — only delegate to sub-agents for that
4. Match the company's tone throughout

Make the prompt feel specifically written for ${ctx.companyName} — reference their industry, goals, and context. Keep it under 250 words.`
  )

  const response = await model.invoke([systemMsg, userMsg])
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content)
}
