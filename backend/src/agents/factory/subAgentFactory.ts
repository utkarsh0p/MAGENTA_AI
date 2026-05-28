import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { AgentConfig, PrebuiltType } from '@prisma/client'
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import type { Organization } from '@prisma/client'
import { getSubAgentMetaTools } from '../tools/composioClient.js'

type DirectSubAgentInput = {
  config: AgentConfig
  adminUserId: string
  checkpointer: PostgresSaver
  org: Organization
}

type BuildSubAgentInput = {
  config: AgentConfig
  tools: unknown[]
  checkpointer?: PostgresSaver
}

const directSubAgentCache = new Map<
  string,
  { agent: ReturnType<typeof createReactAgent>; builtAt: Date }
>()

export function getSubAgentThreadId(prebuiltType: PrebuiltType | string, orgId: string, userId: string) {
  return `subagent_${prebuiltType.toLowerCase()}_${orgId}_${userId}`
}

export function buildSubAgent({ config, tools, checkpointer }: BuildSubAgentInput): ReturnType<typeof createReactAgent> {
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-pro',
    apiKey: process.env.GEMINI_API_KEY,
  })

  return createReactAgent({
    llm: model,
    tools: tools as Parameters<typeof createReactAgent>[0]['tools'],
    prompt: config.systemPrompt,
    ...(checkpointer ? { checkpointer } : {}),
  })
}

export async function buildDirectSubAgent({
  config,
  adminUserId,
  checkpointer,
  org,
}: DirectSubAgentInput) {
  const cacheKey = `${org.id}:${config.prebuiltType}`
  const cached = directSubAgentCache.get(cacheKey)

  if (cached && cached.builtAt >= org.agentsUpdatedAt) {
    return {
      agent: cached.agent,
      threadId: getSubAgentThreadId(config.prebuiltType!, org.id, adminUserId),
    }
  }

  // Meta tools scoped to this specialist's toolkits — 4 tools in context instead of 50+
  // Agent discovers specific actions at runtime; toolkit list is the access boundary
  let tools: unknown[] = []
  try {
    tools = await getSubAgentMetaTools(adminUserId, config.toolkits)
  } catch {
    // Composio unavailable — agent still works for chat without external tools
  }

  const agent = buildSubAgent({ config, tools, checkpointer })

  directSubAgentCache.set(cacheKey, { agent, builtAt: new Date() })

  return {
    agent,
    threadId: getSubAgentThreadId(config.prebuiltType!, org.id, adminUserId),
  }
}
