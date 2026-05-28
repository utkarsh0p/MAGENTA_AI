import { Router } from 'express'
import { prisma } from '../../db/client.js'
import { supabase, supabaseAnon } from '../../db/supabase.js'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, orgName } = req.body as {
    name: string
    email: string
    password: string
    orgName: string
  }

  if (!name || !email || !password || !orgName) {
    res.status(400).json({ error: 'name, email, password, and orgName are required' })
    return
  }

  try {
    // Create organization first to get its id
    const org = await prisma.organization.create({
      data: { name: orgName },
    })

    // Create Supabase auth user with organizationId in metadata
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, organizationId: org.id },
      email_confirm: true,
    })

    if (error) {
      // Roll back org creation
      await prisma.organization.delete({ where: { id: org.id } })
      res.status(400).json({ error: error.message })
      return
    }

    // Mirror user in our public schema
    await prisma.user.create({
      data: {
        id: data.user.id,
        email,
        name,
        organizationId: org.id,
      },
    })

    // Sign in to get a session token
    const { data: session, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !session.session) {
      res.status(500).json({ error: 'Account created but login failed' })
      return
    }

    res.status(201).json({ token: session.session.access_token })
  } catch (err) {
    console.error('register error', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string }

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' })
    return
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  res.json({ token: data.session.access_token })
})

export default router
