import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../../db/client.js'
import { runOnboardingStep, finalizeOnboarding } from '../../agents/reflexive/onboardingFlow.js'

const router = Router()

// GET /api/onboarding/status — no onboarding guard
router.get('/status', requireAuth, async (req, res) => {
  const { org } = req as AuthRequest
  res.json({ completed: org.onboardingCompleted })
})

// GET /api/onboarding/stream — SSE, no onboarding guard
router.get('/stream', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest
  const { id: userId, organizationId } = authReq.user

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const emit = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    await runOnboardingStep({ userId, organizationId, emit, isInitial: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream error'
    emit('error', { message })
  } finally {
    res.end()
  }
})

// POST /api/onboarding/message
router.post('/message', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest
  const { id: userId, organizationId } = authReq.user
  const { content } = req.body as { content: string }

  if (!content) {
    res.status(400).json({ error: 'content is required' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const emit = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    await runOnboardingStep({ userId, organizationId, emit, isInitial: false, userMessage: content })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream error'
    emit('error', { message })
  } finally {
    res.end()
  }
})

// POST /api/onboarding/complete
router.post('/complete', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest
  const { organizationId } = authReq.user
  const { orgContext } = req.body as {
    orgContext: {
      companyName: string
      industry: string
      companySize: string
      adminRole: string
      goals: string
      tone: string
    }
  }

  if (!orgContext) {
    res.status(400).json({ error: 'orgContext is required' })
    return
  }

  try {
    await finalizeOnboarding({ organizationId, orgContext })
    res.json({ ok: true })
  } catch (err) {
    console.error('onboarding complete error', err)
    res.status(500).json({ error: 'Failed to complete onboarding' })
  }
})

export default router
