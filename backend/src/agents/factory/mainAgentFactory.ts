import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import type { Organization } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { getOrchestratorTools, getSubAgentTools } from '../tools/composioClient.js'
import { buildSubAgent } from './subAgentFactory.js'
import { HumanMessage } from '@langchain/core/messages'

type MainAgentInput = {
  orgId: string
  adminUserId: string
  checkpointer: PostgresSaver
  org: Organization
}

const mainAgentCache = new Map<
  string,
  { agent: ReturnType<typeof createReactAgent>; builtAt: Date }
>()

export async function getMainAgent({ orgId, adminUserId, checkpointer, org }: MainAgentInput) {
  const cached = mainAgentCache.get(orgId)
  if (cached && cached.builtAt >= org.agentsUpdatedAt) {
    return { agent: cached.agent, threadId: `main_${orgId}_${adminUserId}` }
  }

  const mainConfig = await prisma.agentConfig.findFirst({
    where: { organizationId: orgId, agentType: 'MAIN' },
  })
  if (!mainConfig) throw new Error('Main agent config not found')

  const subConfigs = await prisma.agentConfig.findMany({
    where: { organizationId: orgId, agentType: 'SUBAGENT' },
  })

  // Wrap each sub-agent as a callable tool — main agent delegates, never calls external APIs directly
  const subAgentTools = await Promise.all(
    subConfigs.map(async (config) => {
      let tools: unknown[] = []
      try {
        tools = await getSubAgentTools(adminUserId, config.toolkits)
      } catch {
        // Composio unavailable — sub-agent still works for reasoning without external tools
      }
      const subAgent = buildSubAgent({ config, tools })
      const toolName = `${config.prebuiltType!.toLowerCase()}_agent`

      return tool(
        async ({ message }: { message: string }) => {
          const result = await subAgent.invoke(
            { messages: [new HumanMessage(message)] },
            { configurable: { thread_id: `tool_${toolName}_${orgId}` } }
          )
          const last = result.messages.at(-1)
          return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)
        },
        {
          name: toolName,
          description: config.description,
          schema: z.object({ message: z.string().describe('The task or question for this specialist') }),
        }
      )
    })
  )

  // Orchestrator meta-tools: lets Main Agent discover what capabilities exist across the org
  // without being able to call any external service directly
  let metaTools: unknown[] = []
  try {
    metaTools = await getOrchestratorTools(adminUserId)
  } catch {
    // Composio unavailable — main agent still works via sub-agent tools alone
  }

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-pro',
    apiKey: process.env.GEMINI_API_KEY,
  })

  const agent = createReactAgent({
    llm: model,
    tools: [...(metaTools as any[]), ...subAgentTools],
    prompt: mainConfig.systemPrompt,
    checkpointer,
  })

  mainAgentCache.set(orgId, { agent, builtAt: new Date() })

  return { agent, threadId: `main_${orgId}_${adminUserId}` }
}
