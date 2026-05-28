import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { composio } from '../../agents/tools/composioClient.js'

const router = Router()
router.use(requireAuth)

// POST /api/composio/onboard — initiate OAuth for a toolkit (e.g. { toolkit: 'GMAIL' })
router.post('/onboard', async (req, res) => {
  const { id: userId } = (req as AuthRequest).user
  const { toolkit } = req.body as { toolkit: string }

  if (!toolkit) {
    res.status(400).json({ error: 'toolkit is required' })
    return
  }

  try {
    // Get the default auth config for this toolkit, then initiate a connection for the user
    const authConfigs = await composio.authConfigs.list({ toolkit })
    const authConfig = authConfigs.items?.[0]
    if (!authConfig) {
      res.status(404).json({ error: `No auth config found for toolkit: ${toolkit}` })
      return
    }

    const connectionRequest = await composio.connectedAccounts.initiate(userId, authConfig.id, {
      callbackUrl: `${process.env.FRONTEND_URL}/composio/callback`,
    })

    res.json({ redirectUrl: connectionRequest.redirectUrl })
  } catch (err) {
    console.error('composio onboard error', err)
    res.status(500).json({ error: 'Failed to initiate connection' })
  }
})

// GET /api/composio/callback
router.get('/callback', (_req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/dashboard?connected=true`)
})

// GET /api/composio/status/:userId — list connected accounts for a user
router.get('/status/:userId', async (req, res) => {
  try {
    const connections = await composio.connectedAccounts.list({ userIds: [req.params.userId] })
    res.json({ connections: connections.items })
  } catch (err) {
    console.error('composio status error', err)
    res.status(500).json({ error: 'Failed to fetch status' })
  }
})

export default router
