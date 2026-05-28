import { streamReflexiveResponse, generateTailoredPrompt, generateMainAgentPrompt } from './reflexiveAgent.js'
import { prisma } from '../../db/client.js'
import { PREBUILT_AGENTS, type OrgContext } from '../prebuilt/registry.js'
import type { PrebuiltType } from '@prisma/client'

const onboardingHistory = new Map<
  string,
  { role: 'user' | 'assistant'; content: string }[]
>()

type StepInput = {
  userId: string
  organizationId: string
  emit: (event: string, data: unknown) => void
  isInitial: boolean
  userMessage?: string
}

export async function runOnboardingStep({
  userId,
  organizationId: _organizationId,
  emit,
  isInitial,
  userMessage,
}: StepInput) {
  const history = onboardingHistory.get(userId) ?? []

  const prompt = isInitial ? 'Hello! Please start the onboarding.' : (userMessage ?? '')

  let fullResponse = ''

  for await (const chunk of streamReflexiveResponse(history, prompt)) {
    fullResponse += chunk
    emit('onboarding_token', { content: chunk })
  }

  history.push({ role: 'user', content: prompt })
  history.push({ role: 'assistant', content: fullResponse })
  onboardingHistory.set(userId, history)

  const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as { orgContext: OrgContext; confirmed: boolean }
      if (parsed.confirmed && parsed.orgContext) {
        emit('onboarding_complete', { orgContext: parsed.orgContext })
        onboardingHistory.delete(userId)
      }
    } catch {
      // Not valid JSON — continue conversation
    }
  }

  emit('done', {})
}

export async function finalizeOnboarding({
  organizationId,
  orgContext,
}: {
  organizationId: string
  orgContext: OrgContext
}) {
  const prebuiltTypes = Object.keys(PREBUILT_AGENTS) as PrebuiltType[]

  // Generate all 5 prompts in parallel — Gemini tailors each to the company
  const [mainPrompt, ...subPrompts] = await Promise.all([
    generateMainAgentPrompt(orgContext),
    ...prebuiltTypes.map((type) => {
      const t = PREBUILT_AGENTS[type]
      return generateTailoredPrompt(orgContext, t.name, t.toolkits, t.systemPromptTemplate)
    }),
  ])

  await prisma.agentConfig.create({
    data: {
      name: 'Main Agent',
      description: `AI chief-of-staff for ${orgContext.companyName}`,
      systemPrompt: mainPrompt,
      toolkits: [],
      agentType: 'MAIN',
      organizationId,
    },
  })

  await prisma.agentConfig.createMany({
    data: prebuiltTypes.map((type, i) => {
      const template = PREBUILT_AGENTS[type]
      return {
        name: template.name,
        description: template.description,
        systemPrompt: subPrompts[i],
        toolkits: template.toolkits,
        agentType: 'SUBAGENT' as const,
        prebuiltType: type,
        organizationId,
      }
    }),
  })

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      onboardingCompleted: true,
      orgContext,
      agentsUpdatedAt: new Date(),
    },
  })
}
