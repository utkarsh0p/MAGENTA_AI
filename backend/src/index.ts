import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRouter from './api/routes/auth.js'
import agentsRouter from './api/routes/agents.js'
import conversationsRouter from './api/routes/conversations.js'
import onboardingRouter from './api/routes/onboarding.js'
import composioRouter from './api/routes/composio.js'

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/onboarding', onboardingRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/composio', composioRouter)

const PORT = process.env.PORT ?? 8000
app.listen(PORT, () => console.log(`Backend running on :${PORT}`))
