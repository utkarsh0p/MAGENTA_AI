import { Composio } from '@composio/core'
import { LangchainProvider } from '@composio/langchain'

if (!process.env.COMPOSIO_API_KEY) {
  throw new Error('COMPOSIO_API_KEY must be set')
}

// LangchainProvider wraps Composio tools as DynamicStructuredTool instances for LangGraph
const provider = new LangchainProvider()
export const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY, provider })

// Sub Agent in tool mode: load actual toolkit tools so it can act, not just reason
export async function getSubAgentTools(userId: string, toolkits: string[]) {
  return composio.tools.get(userId, { toolkits })
}

// Sub Agent in direct-chat mode: meta tools scoped to its toolkit boundary
// 4 tools in context instead of 50+ — agent discovers specific tools at runtime
export async function getSubAgentMetaTools(userId: string, toolkits: string[]) {
  return composio.tools.get(userId, { toolkits: ['COMPOSIO_SEARCH_TOOLS', ...toolkits] })
}

// Main Agent: only gets COMPOSIO_SEARCH_TOOLS meta-toolkit
// Lets it discover what capabilities exist and delegate to specialists — never calls external APIs directly
export async function getOrchestratorTools(userId: string) {
  return composio.tools.get(userId, { toolkits: ['COMPOSIO_SEARCH_TOOLS'] })
}
