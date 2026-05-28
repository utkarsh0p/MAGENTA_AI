import { Router } from 'express'
import { requireAuth, requireOnboarding, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../../db/client.js'
import { buildDirectSubAgent, getSubAgentThreadId } from '../../agents/factory/subAgentFactory.js'
import { getMainAgent } from '../../agents/factory/mainAgentFactory.js'
import { getCheckpointer } from '../../agents/checkpointer.js'
import { HumanMessage } from '@langchain/core/messages'
import type { createReactAgent } from '@langchain/langgraph/prebuilt'

const router = Router()
router.use(requireAuth, requireOnboarding)

// GET /api/conversations
router.get('/', async (req, res) => {
  const { id: userId, organizationId } = (req as AuthRequest).user

  const conversations = await prisma.conversation.findMany({
    where: { userId, organizationId },
    select: { id: true, title: true, threadId: true, agentId: true },
    orderBy: { id: 'desc' },
  })

  res.json(conversations)
})

// POST /api/conversations — get-or-create
router.post('/', async (req, res) => {
  const { id: userId, organizationId } = (req as AuthRequest).user
  const { agentId, title } = req.body as { agentId?: string; title?: string }

  // Default to Main Agent if no agentId provided
  let resolvedAgentId = agentId
  if (!resolvedAgentId) {
    const mainAgent = await prisma.agentConfig.findFirst({
      where: { organizationId, agentType: 'MAIN' },
    })
    if (!mainAgent) {
      res.status(404).json({ error: 'Main agent not found' })
      return
    }
    resolvedAgentId = mainAgent.id
  }

  const agentConfig = await prisma.agentConfig.findFirst({
    where: { id: resolvedAgentId, organizationId },
  })
  if (!agentConfig) {
    res.status(404).json({ error: 'Agent not found' })
    return
  }

  const threadId =
    agentConfig.agentType === 'MAIN'
      ? `main_${organizationId}_${userId}`
      : getSubAgentThreadId(agentConfig.prebuiltType!, organizationId, userId)

  const conversation = await prisma.conversation.upsert({
    where: { threadId },
    update: {},
    create: {
      userId,
      agentId: resolvedAgentId,
      organizationId,
      threadId,
      title: title ?? agentConfig.name,
    },
  })

  res.json(conversation)
})

// GET /api/conversations/:id/messages
router.get('/:id/messages', async (req, res) => {
  const { id: userId, organizationId } = (req as unknown as AuthRequest).user

  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId, organizationId },
  })
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  })

  res.json(messages)
})

// POST /api/conversations/:id/messages
router.post('/:id/messages', async (req, res) => {
  const { id: userId, organizationId } = (req as unknown as AuthRequest).user
  const { content } = req.body as { content: string }

  if (!content) {
    res.status(400).json({ error: 'content is required' })
    return
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId, organizationId },
  })
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: 'user', content },
  })

  res.json({ ok: true })
})

// GET /api/conversations/:id/stream — SSE
router.get('/:id/stream', async (req, res) => {
  const authReq = req as unknown as AuthRequest
  const { id: userId, organizationId } = authReq.user
  const org = authReq.org

  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId, organizationId },
    include: { agentConfig: true },
  })
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }

  const { content } = req.query as { content?: string }
  if (!content) {
    res.status(400).json({ error: 'content query param is required' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const emit = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    const checkpointer = await getCheckpointer()
    const agentConfig = conversation.agentConfig

    let agent: ReturnType<typeof createReactAgent>
    let threadId = conversation.threadId

    if (agentConfig.agentType === 'MAIN') {
      const result = await getMainAgent({ orgId: organizationId, adminUserId: userId, checkpointer, org })
      agent = result.agent
      threadId = result.threadId
    } else {
      const result = await buildDirectSubAgent({
        config: agentConfig,
        adminUserId: userId,
        checkpointer,
        org,
      })
      agent = result.agent
      threadId = result.threadId
    }

    // Save user message
    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content },
    })

    const eventType = agentConfig.agentType === 'MAIN' ? 'main_token' : 'subagent_direct_token'
    let fullResponse = ''

    const stream = agent.streamEvents(
      { messages: [new HumanMessage(content)] },
      { version: 'v2' as const, configurable: { thread_id: threadId } }
    )

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk?.content as string | undefined
        if (chunk) {
          fullResponse += chunk
          emit(eventType, { content: chunk })
        }
      }

      // Sub-agent delegation attribution
      if (agentConfig.agentType === 'MAIN' && event.event === 'on_tool_start') {
        const toolName = event.name as string
        if (toolName.endsWith('_agent')) {
          emit('subagent_start', { name: toolName })
        }
      }
      if (agentConfig.agentType === 'MAIN' && event.event === 'on_tool_stream') {
        const chunk = event.data?.chunk as string | undefined
        if (chunk) emit('subagent_token', { content: chunk })
      }
    }

    // Persist assistant message
    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: fullResponse },
    })

    res.write('event: done\ndata: {}\n\n')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stream error'
    emit('error', { message })
  } finally {
    res.end()
  }
})

export default router
