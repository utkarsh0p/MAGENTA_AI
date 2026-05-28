# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Style

See [`CODING_STYLE.md`](./CODING_STYLE.md) for the full coding style guide. Key principles: minimal, modular, no abstraction until 3+ real use cases. No service layers — route handlers call factories/db directly. No barrel files. Page-specific components stay in the page folder.

## UI Style

See [`STYLES.md`](./STYLES.md) for the full UI style guide. Key principles: agentic UI, dark-first, no visible scrollbars, viewport-contained layouts, motion as signal only. Every view must fit within the screen without overflow.

## Project Overview

**HumanTouch** is a multi-tenant agentic SaaS platform where every organization gets a **Main Agent** (their AI chief-of-staff) backed by **4 pre-built Sub Agents** (specialists). The admin can chat with the Main Agent (which orchestrates Sub Agents as tools) or chat directly with any Sub Agent independently.

**Primary user:** Solo founders and freelancers — one person running a business who wants an AI team to handle specialist work they can't hire for yet.

### Subscription Tiers

| Tier | What's included |
|---|---|
| **Free (current build)** | Main Agent + 4 pre-built Sub Agents, all managed by the admin |
| **Enterprise (future)** | Custom agent creation, role-specific agents assigned to individual employees |

Everything described in this file is the **free tier only**. Do not implement enterprise features.

### Actor Types

1. **Admin** — the organization owner. Completes onboarding, then chats with the Main Agent or directly with any Sub Agent.
2. **Main Agent** — the org's top-level AI. Handles general conversation and knowledge questions directly from its LLM (Gemini 2.5 Pro). Delegates specialist work to Sub Agents as tools. Cached per org.
3. **Sub Agents (4 pre-built)** — specialist agents. Stateless when used as Main Agent tools. Persistent (checkpointer + threadId) when chatted with directly by the admin.
4. **Reflexive Agent** — a stateless, ephemeral agent used to generate system prompts through conversation. Never stored in DB. Used during onboarding only.

---

Two separate services:

| Service | Path | Stack |
|---|---|---|
| Frontend | `frontend/` | Next.js 14+ (App Router), TypeScript |
| Backend | `backend/` | Node.js, TypeScript, LangGraph.js, Express, Prisma, Supabase PostgreSQL |

Auth: email + password via **Supabase Auth**. Backend verifies tokens with `supabase.auth.getUser(token)`. Frontend uses `@supabase/ssr` client — session stored in Supabase-managed cookies. No custom JWT signing. No NextAuth.

---

## Commands

### Frontend
```bash
cd frontend
npm install
npm run dev        # :3000
npm run build
npm run lint
npm run type-check # tsc --noEmit
```

### Backend
```bash
cd backend
npm install
npm run dev        # tsx watch, :8000
npm run build
npm run start

npm run db:generate   # after schema changes
npm run db:migrate    # prisma migrate dev
npm run db:push       # quick schema sync, no migration file
npm run db:studio
```

---

## Architecture

### Frontend

```
app/
  (auth)/
    sign-in/
    sign-up/
  onboarding/                     # first-login flow; reflexive agent chat to set up Main Agent
  (admin)/
    dashboard/                    # main view: agent network graph + chat + live logs
lib/
  api-client.ts                   # typed fetch wrapper; attaches Authorization: Bearer token
  auth.ts                         # JWT helpers: store/retrieve token from cookie, decode user
middleware.ts                     # reads JWT cookie; redirect to /onboarding if not onboarded; guard /admin
```

### Backend (`backend/src/`)

```
agents/
  factory/
    mainAgentFactory.ts           # builds Main Agent; attaches all Sub Agents as tools; caches per org
    subAgentFactory.ts            # buildSubAgent (tool mode or direct-chat mode); buildDirectSubAgent; cache
  prebuilt/
    templates/                    # one file per sub agent type (hrTemplate.ts, salesTemplate.ts, …)
    registry.ts                   # PREBUILT_AGENTS map: type → template
  reflexive/
    reflexiveAgent.ts             # ephemeral createReactAgent for generating system prompts
    onboardingFlow.ts             # orchestrates onboarding question sequence via reflexive agent
  tools/
    composioClient.ts             # Composio + LangchainProvider; getSubAgentTools(); getOrchestratorTools()
    toolRegistry.ts               # PREBUILT_TOOLKITS: toolkit slug lists per sub agent type
api/
  routes/
    agents.ts                     # GET /api/agents — list all AgentConfigs for org
    conversations.ts              # conversations + messages + SSE stream routes
    onboarding.ts                 # onboarding flow routes
    auth.ts                       # POST /api/auth/register, POST /api/auth/login
  middleware/
    auth.ts                       # JWT verify; attaches req.user + req.org
    orgScope.ts                   # all queries filtered by organizationId
db/client.ts                      # Prisma singleton
prisma/schema.prisma              # source of truth
```

---

## Auth

Backend issues a signed JWT (HS256) containing `{ userId, organizationId, role }` on successful login. Frontend stores it in an httpOnly cookie. All backend routes (except `/api/auth/*` and `/api/onboarding/status`) require `Authorization: Bearer <token>` or the cookie.

`lib/auth.ts` (frontend) exposes helpers: `getToken()`, `setToken()`, `clearToken()`, `decodeUser()`. `lib/api-client.ts` reads the token and attaches it to every request. `middleware.ts` reads the cookie to protect admin routes server-side.

---

## Onboarding Flow

Triggered on first login when `org.onboardingCompleted = false`. Admin is redirected to `/onboarding`.

```
1. Frontend opens SSE stream to GET /api/onboarding/stream
2. Reflexive Agent (ONBOARDING mode) asks questions about the org:
     - Company name, industry, size
     - Admin's role and responsibilities
     - Primary goals for the AI agent
     - Tone/personality preferences
3. Admin answers via POST /api/onboarding/message
4. Reflexive Agent generates:
     a. Main Agent system prompt (rich, org-specific)
     b. Org context object { companyName, industry, size, adminRole, goals, tone }
5. POST /api/onboarding/complete:
     - Creates Main AgentConfig in DB with generated system prompt (toolkits: [])
     - Creates all 4 Sub AgentConfigs in DB — each template's placeholders filled with org context, toolkits from PREBUILT_TOOLKITS
     - Sets org.onboardingCompleted = true, org.agentsUpdatedAt = now()
6. Admin redirected to /admin/dashboard
```

The Reflexive Agent is never stored. It runs ephemeral, no checkpointer, no DB record.

### Onboarding UX Shape

The onboarding page is a **guided wizard with embedded chat** — not a plain form and not a freeform chat.

```
Structure:
- Progress bar at top showing current step (e.g. "Step 2 of 4 — Your Role")
- Each step has a defined topic: Company → Role → Goals → Tone/Personality
- Within each step, the Reflexive Agent drives the conversation:
    → asks a focused question for that step
    → user replies freely
    → agent may ask 1 follow-up if needed
    → step marked complete, move to next
- Final step: Reflexive Agent summarizes what it understood and asks for confirmation
- On confirm → POST /api/onboarding/complete
```

---

## Reflexive Agent

`agents/reflexive/reflexiveAgent.ts`

A `createReactAgent` instance with a meta-prompt instructing it to:
- Ask targeted questions to understand context
- Synthesize answers into a well-structured system prompt
- Return the generated prompt as its final message

Two modes passed via system prompt variant:

| Mode | Purpose | Output |
|---|---|---|
| `ONBOARDING` | Full org context gathering | Main Agent system prompt |
| `SUBAGENT_CONTEXT` | Fill placeholders for one sub agent type | Filled sub-agent system prompt |

No tools. No checkpointer. Fresh uuid threadId every invocation.

---

## Pre-built Sub Agents

4 sub agents provisioned for every org during onboarding. Each is stored as an `AgentConfig` with `agentType = SUBAGENT` and a `prebuiltType` enum.

All sub agents are connected to the Main Agent as tools. Main Agent tool name = sub agent `prebuiltType` in lowercase with `_agent` suffix (e.g. `hr_agent`, `software_engineer_agent`).

| # | prebuiltType | Responsibility | Composio Toolkits |
|---|---|---|---|
| 1 | `HR` | Screen resumes, schedule interviews, send offer letters, onboard employees, answer HR FAQs | GMAIL, GOOGLECALENDAR, GOOGLEDRIVE |
| 2 | `SOCIAL_MEDIA_MANAGER` | Draft and publish posts, manage brand presence on Twitter/Instagram, schedule content | TWITTER, INSTAGRAM, SLACK, NOTION |
| 3 | `SOFTWARE_ENGINEER` | Manage GitHub/GitLab repos, review PRs, create/track Jira issues, coordinate via Slack | GITHUB, GITLAB, JIRA, SLACK |
| 4 | `UI_UX_DESIGNER` | Manage Figma files, document design decisions in Notion, coordinate design reviews via Slack | FIGMA, NOTION, SLACK |

### Main Agent Behavior

The Main Agent (chief-of-staff) has two modes:

1. **General conversation / knowledge questions** — answered directly by Gemini 2.5 Pro without calling any tool. Example: "What's the capital of France?", "Help me write a pitch email" (drafted inline).
2. **Specialist work** — delegated to the appropriate sub-agent tool with a visible attribution message. Example: "Post a job description on LinkedIn" → delegates to `social_media_manager_agent` and announces it.

The Main Agent only has `COMPOSIO_SEARCH_TOOLS` (meta-tools for discovering what capabilities exist) + the 4 sub-agent wrappers. It never calls external APIs (Gmail, GitHub, etc.) directly.

### Template System Prompt Structure

Each template in `agents/prebuilt/templates/` has:

```typescript
export const softwareEngineerTemplate = {
  name: 'Software Engineer',
  prebuiltType: 'SOFTWARE_ENGINEER',
  description: '...',
  toolkits: ['GITHUB', 'GITLAB', 'JIRA', 'SLACK'],
  systemPromptTemplate: `
    You are the Software Engineer agent for {{companyName}}, a {{industry}} company.
    Your role: ...
    Company size: {{companySize}}
    Key responsibilities: ...
  `,
}
```

Placeholders: `{{companyName}}`, `{{industry}}`, `{{companySize}}`, `{{adminRole}}`, `{{goals}}`, `{{tone}}`.

---

## LangGraph Agent System

### MainAgentFactory (`agents/factory/mainAgentFactory.ts`)

```
Input:  orgId + adminUserId + checkpointer
Output: { agent: CompiledStateGraph, threadId: string }

1. Check mainAgentCache — if builtAt >= org.agentsUpdatedAt, return cached agent
2. Load Main AgentConfig WHERE organizationId = orgId AND agentType = MAIN
3. Load all Sub AgentConfigs WHERE organizationId = orgId AND agentType = SUBAGENT
4. For each sub agent config:
     a. buildSubAgent({ config, tools: [] })   ← tools loaded lazily at direct-chat time
     b. wrap subAgent as a LangChain tool: name = config.prebuiltType.toLowerCase() + '_agent'
5. getOrchestratorTools(adminUserId) → COMPOSIO_SEARCH_TOOLS meta-toolkit only
6. allTools = [...metaTools, ...subAgentTools]
7. agent = createReactAgent({ llm: gemini-2.5-pro, tools: allTools, prompt: mainConfig.systemPrompt, checkpointer })
8. Update mainAgentCache: { agent, builtAt: now() }
9. threadId = main_{organizationId}_{adminUserId}
```

The Main Agent NEVER calls external APIs (Gmail, GitHub, etc.) directly. It answers general questions from LLM knowledge or delegates to sub-agents.

### SubAgentFactory (`agents/factory/subAgentFactory.ts`)

Two exported functions:

**`buildSubAgent`** — used by `MainAgentFactory` to build stateless sub-agent tools:
```
Input:  AgentConfig + tools[] + optional checkpointer
Output: CompiledStateGraph

createReactAgent({ llm, tools, prompt: config.systemPrompt, ...checkpointer if provided })
```

**`buildDirectSubAgent`** — used by the stream route for direct admin↔sub-agent chat:
```
Input:  AgentConfig + adminUserId + checkpointer + org
Output: { agent: CompiledStateGraph, threadId: string }

1. Check directSubAgentCache (keyed by orgId:prebuiltType) — return if builtAt >= org.agentsUpdatedAt
2. getSubAgentTools(adminUserId, config.toolkits) → toolkit-restricted Composio tools
3. agent = buildSubAgent({ config, tools, checkpointer })
4. Update directSubAgentCache
5. threadId = getSubAgentThreadId(prebuiltType, orgId, userId)
```

**`getSubAgentThreadId(prebuiltType, orgId, userId)`** — pure helper, exported. Always use this; never inline the format string.

### Caching

```
mainAgentCache:        Map<orgId, { agent, builtAt }>
directSubAgentCache:   Map<"orgId:prebuiltType", { agent, builtAt }>

Both caches invalidate when builtAt < org.agentsUpdatedAt.
Always bump org.agentsUpdatedAt on any AgentConfig create/update/delete.
```

### Chat UX — Sub Agent Transparency (Main Agent mode)

When the Main Agent delegates to a Sub Agent, the SSE stream emits attribution events:

```
[HR Agent is working on this…]
← streaming response from HR Agent →
[Main Agent] Here's what the HR Agent found: …
```

### Dashboard Layout

Single main page at `/admin/dashboard`. Intended UX: graphical view of the agent network (Main Agent + connected Sub Agents as nodes), chat panel, and live activity log showing which agents are active and message flow. Exact UI implementation to be defined during frontend build.

### Composio

**SDK:** `@composio/core` + `@composio/langchain`. The `LangchainProvider` wraps Composio tools as `DynamicStructuredTool` instances compatible with LangGraph.

`agents/tools/composioClient.ts` exports:
- `composio` — the `Composio` instance (used for OAuth/account management in routes)
- `getSubAgentTools(userId, toolkits[])` — fetches toolkit-restricted tools for a specialist. Each specialist only sees its own toolkits (HR can't touch GitHub, Software Engineer can't touch Gmail).
- `getOrchestratorTools(userId)` — fetches only `COMPOSIO_SEARCH_TOOLS` meta-toolkit for the Main Agent. Lets it discover what's available without being able to call any external service directly.

`agents/tools/toolRegistry.ts` exports `PREBUILT_TOOLKITS: Record<PrebuiltType, string[]>` — maps each specialist to its toolkit slug list.

**Lazy OAuth** — do not require tool connections during onboarding. Sub agents go live immediately. If a sub agent attempts an action and the user has not connected that toolkit, catch the error and emit to the SSE stream: "To use [toolkit], you need to connect your account. [Connect now →]" which triggers `POST /api/composio/onboard`. Never implement OAuth manually.

`POST /api/composio/onboard` takes `{ toolkit: string }` (e.g. `"GMAIL"`), not `{ app }`. Uses `composio.connectedAccounts.initiate(userId, authConfigId, { callbackUrl })` to start OAuth.

### Checkpointing

`@langchain/langgraph-checkpoint-postgres`. Used by the Main Agent and by Sub Agents in direct-chat mode. Same `threadId` = persistent memory across sessions. Sub agents in tool mode and the Reflexive Agent are stateless (no checkpointer).

### Streaming

`GET /api/conversations/:id/stream` is SSE. LangGraph `streamEvents()` feeds tokens directly into the SSE response. Frontend reads via `EventSource`. Onboarding also streams via `GET /api/onboarding/stream`.

### SSE Event Types

| Event | When |
|---|---|
| `main_token` | Main Agent generating tokens |
| `subagent_start` | Main Agent delegating to a Sub Agent (includes name + prebuiltType) |
| `subagent_token` | Sub Agent tokens during Main Agent orchestration |
| `subagent_direct_token` | Admin chatting directly with a Sub Agent |
| `error` | Tool not connected or fatal error |

---

## Database Schema

```prisma
enum Role        { ADMIN }
enum AgentType   { MAIN SUBAGENT }
enum PrebuiltType { HR SOCIAL_MEDIA_MANAGER SOFTWARE_ENGINEER UI_UX_DESIGNER }

model Organization {
  id                  String        @id @default(cuid())
  name                String
  onboardingCompleted Boolean       @default(false)
  orgContext          Json?         // { companyName, industry, companySize, adminRole, goals, tone }
  agentsUpdatedAt     DateTime      @default(now())
  users               User[]
  agents              AgentConfig[]
  conversations       Conversation[]
}

model User {
  id             String         @id   // UUID matching Supabase auth.users.id
  email          String         @unique
  name           String
  role           Role           @default(ADMIN)
  organizationId String
  organization   Organization   @relation(fields: [organizationId], references: [id])
  conversations  Conversation[]
  // passwordHash removed — auth handled by Supabase Auth
}

model AgentConfig {
  id              String         @id @default(cuid())
  name            String
  description     String
  systemPrompt    String
  toolkits        String[]       // Composio toolkit slugs (e.g. ["GITHUB", "JIRA"]); empty for MAIN agent
  agentType       AgentType
  prebuiltType    PrebuiltType?  // null for MAIN agent
  organizationId  String
  organization    Organization   @relation(fields: [organizationId], references: [id])
  conversations   Conversation[]
}

model Conversation {
  id             String       @id @default(cuid())
  userId         String
  agentId        String
  organizationId String
  threadId       String       @unique
  title          String?
  user           User         @relation(fields: [userId], references: [id])
  agentConfig    AgentConfig  @relation(fields: [agentId], references: [id])
  organization   Organization @relation(fields: [organizationId], references: [id])
  messages       Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           String       // user | assistant | tool_result
  content        String
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
}
```

---

## Multi-Tenancy

Supabase Auth middleware calls `supabase.auth.getUser(token)` → extracts `organizationId` from `user.user_metadata.organizationId` → looks up `req.org` from DB. Every DB query must filter by `organizationId`. Orgs are fully isolated — agents, conversations, and context from one org are never visible to another.

## Supabase

- **Project URL:** `https://zmoyeglprqshovlolwfo.supabase.co`
- **Anon key env var:** `SUPABASE_ANON_KEY` (also `NEXT_PUBLIC_SUPABASE_ANON_KEY` on frontend)
- **Service role env var:** `SUPABASE_SERVICE_ROLE_KEY` — backend only, never expose to frontend
- **DB connection:** `DATABASE_URL` — use Supabase direct connection (port 5432), not the pooler (port 6543)
- **Backend client:** `db/supabase.ts` — exports `supabase` (service role) and `supabaseAnon` (for signInWithPassword)
- **Frontend client:** `lib/supabase.ts` (browser), `lib/supabase-server.ts` (server components / middleware)
- RLS is **disabled** on all tables — multi-tenancy enforced in the Express layer via `organizationId` filtering

---

## Key Invariants

1. Agent behavior is never hardcoded — system prompts always come from `AgentConfig.systemPrompt` in DB.
2. Never implement OAuth or API wrappers for third-party services — always use Composio.
3. Every DB query must be scoped by `organizationId`.
4. Never reuse a `threadId` across users or sessions.
5. Main Agent and direct sub-agent instances are cached per org — always bump `agentsUpdatedAt` on any AgentConfig create/update/delete.
6. Sub agents used as Main Agent tools are stateless (no checkpointer). Sub agents in direct-chat mode have a checkpointer and persistent threadId.
7. Reflexive Agent is always ephemeral — never stored in DB, no checkpointer.
8. All agent responses stream via SSE — never wait for full completion.
9. Onboarding must complete before any chat is accessible — enforce in middleware.
10. The free tier has no employee-facing features — do not implement enterprise features.
11. Always use `getSubAgentThreadId(prebuiltType, orgId, userId)` to construct sub-agent threadIds — never inline the format string.
12. Main Agent never calls external APIs directly — it answers general questions from LLM knowledge and delegates specialist work to sub-agents. Never give the Main Agent toolkit-specific Composio tools.
13. Each sub agent's Composio session is restricted to its own toolkit list (`config.toolkits`). Never fetch tools without a toolkit filter for a specialist agent.
14. `AgentConfig.toolkits` stores Composio toolkit slugs (e.g. `["GITHUB", "JIRA"]`), not action slugs. Use `getSubAgentTools(userId, config.toolkits)` — never pass action strings directly.

---

## API Routes

```
POST /api/auth/register             # { name, email, password, orgName } → { token }
POST /api/auth/login                # { email, password } → { token }

GET  /api/onboarding/status         # { completed: boolean }
GET  /api/onboarding/stream         # SSE: reflexive agent onboarding chat
POST /api/onboarding/message        # send message to reflexive agent
POST /api/onboarding/complete       # finalize: creates Main + Sub AgentConfigs

GET  /api/agents                    # list all AgentConfigs for org (id, name, description, agentType, prebuiltType)

GET  /api/conversations             # list conversations for user
POST /api/conversations             # get-or-create conversation; body: { agentId?, title? }
GET  /api/conversations/:id/messages
POST /api/conversations/:id/messages
GET  /api/conversations/:id/stream  # SSE

POST /api/composio/onboard             # { toolkit: string } → { redirectUrl }
GET  /api/composio/callback
GET  /api/composio/status/:userId
```
