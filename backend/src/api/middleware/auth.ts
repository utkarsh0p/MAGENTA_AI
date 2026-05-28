import type { Request, Response, NextFunction } from 'express'
import { supabase } from '../../db/supabase.js'
import { prisma } from '../../db/client.js'

export interface AuthRequest extends Request {
  user: { id: string; organizationId: string; role: string }
  org: { id: string; name: string; onboardingCompleted: boolean; orgContext: import('@prisma/client').Prisma.JsonValue; agentsUpdatedAt: Date }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' })
    return
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  const organizationId = user.user_metadata?.organizationId as string | undefined
  if (!organizationId) {
    res.status(401).json({ error: 'No organization linked to this account' })
    return
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId } })
  if (!org) {
    res.status(401).json({ error: 'Organization not found' })
    return
  }

  const authReq = req as AuthRequest
  authReq.user = { id: user.id, organizationId, role: 'ADMIN' }
  authReq.org = org

  next()
}

export async function requireOnboarding(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthRequest
  if (!authReq.org.onboardingCompleted) {
    res.status(403).json({ error: 'Onboarding not completed' })
    return
  }
  next()
}
