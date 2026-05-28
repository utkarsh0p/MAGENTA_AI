import { Router } from 'express'
import { requireAuth, requireOnboarding, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../../db/client.js'

const router = Router()

router.use(requireAuth, requireOnboarding)

// GET /api/agents
router.get('/', async (req, res) => {
  const { organizationId } = (req as AuthRequest).user

  const agents = await prisma.agentConfig.findMany({
    where: { organizationId },
    select: { id: true, name: true, description: true, agentType: true, prebuiltType: true },
  })

  res.json(agents)
})

export default router
