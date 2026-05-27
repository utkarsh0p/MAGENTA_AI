# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Style

See [`CODING_STYLE.md`](./CODING_STYLE.md) for the full coding style guide. Key principles: minimal, modular, no abstraction until 3+ real use cases. No service layers — route handlers call factories/db directly. No barrel files. Page-specific components stay in the page folder.

## Project Overview

HumanTouch is a multi-tenant agentic SaaS platform with three actor types:

1. **Admin (CEO)** — creates agents, assigns them to employees, chats with a supervisor agent that wraps all created agents as tools and can spawn new agents dynamically.
2. **Employee** — sees only assigned agents, chats with each independently with full persistent memory per conversation.
3. **Supervisor Agent** — admin's top-level agent; cached per organization, rebuilt only when agents change.

Two separate services:

| Service | Path | Stack |
|---|---|---|
| Frontend | `frontend/` | Next.js 14+ (App Router), NextAuth.js v5, TypeScript |
| Backend | `backend/` | Node.js, TypeScript, LangGraph.js, Express, Prisma, PostgreSQL |

---

## Commands

### Frontend
```bash
cd frontend
pnpm install
pnpm dev           # :3000
pnpm build
pnpm lint
pnpm type-check    # tsc --noEmit
```

### Backend
```bash
cd backend
pnpm install
pnpm dev           # tsx watch, :8000
pnpm build
pnpm start

pnpm db:generate   # after schema changes
pnpm db:migrate    # prisma migrate dev
pnpm db:push       # quick schema sync, no migration file
pnpm db:studio
```

---

## Architecture

### Frontend

```
app/
  (auth)/sign-in, sign-up
  (admin)/
    dashboard/
    agents/new, [agentId]/      # 4-step agent creation form
    employees/[employeeId]/
    chat/                       # supervisor chat + SSE stream
  (employee)/
    agents/[agentId]/[conversationId]/
  api/auth/                     # NextAuth [...nextauth] handler
auth.ts                         # NextAuth config; JWT contains userId, organizationId, role
middleware.ts                   # guards /admin routes for ADMIN, /employee for EMPLOYEE
lib/api-client.ts               # typed fetch; attaches Authorization: Bearer token
```

### Backend (`backend/src/`)

```
agents/
  factory/
    agentFactory.ts             # builds agent from AgentConfig; never cache instances
    supervisorFactory.ts        # caches supervisor per org; rebuilds only when agents change
    spawnAgent.ts               # spawn_agent tool logic + depth/persist guards
  tools/
    composioClient.ts           # single ComposioToolSet singleton
    toolRegistry.ts             # SPAWNABLE_ACTIONS whitelist
graphs/
  agentGraph.ts                 # generic ReAct agent graph template
  supervisorGraph.ts            # supervisor StateGraph; routes tasks to sub-agent nodes
api/
  routes/                       # agents, employees, conversations, messages, tasks
  middleware/auth.ts            # JWT verify; attaches req.org.organizationId
  middleware/orgScope.ts        # all queries filtered by organizationId
db/client.ts                    # Prisma singleton
prisma/schema.prisma            # source of truth
```

### LangGraph Agent System

**AgentFactory** (`agents/factory/agentFactory.ts`)

```
Input:  AgentConfig + User + checkpointer + mode (STANDALONE | SUPERVISOR_CALL)
Output: { agent: CompiledStateGraph, threadId: string }

1. composio.getTools({ actions: config.tools, entityId: user.id })
2. system prompt = config.systemPrompt + employee context (name, role)
3. if config.canSpawn → add spawn_agent tool
4. createReactAgent({ model, tools, prompt, checkpointer })
5. threadId:
     STANDALONE:        agent_{agentId}_emp_{userId}
     SUPERVISOR_CALL:   supervisor_call_{agentId}_emp_{userId}_{uuid}
```

**SupervisorFactory** (`agents/factory/supervisorFactory.ts`)

```
1. Pull all AgentConfigs WHERE org = admin.org AND isTopLevel = false
2. Each config → tool (name = config.name, description = config.description, handler = AgentFactory)
3. Add spawn_agent tool
4. createReactAgent(...)
5. threadId = supervisor_{organizationId}_{adminId}
```

**Supervisor Caching**

Supervisor is cached per organization. On every admin invoke:

```
check supervisorCache for organizationId
  → compare cache.builtAt vs org.agentsUpdatedAt
  → builtAt >= agentsUpdatedAt  → use cached supervisor
  → builtAt <  agentsUpdatedAt  → rebuild + update cache
```

Cache lives in a module-level Map in `supervisorFactory.ts`:

```typescript
const supervisorCache = new Map<string, { supervisor: any, builtAt: Date }>()
```

Whenever any agent is created, updated, or deleted — always update the timestamp:

```typescript
await db.organization.update({
  where: { id: organizationId },
  data: { agentsUpdatedAt: new Date() }
})
```

Multiple orgs never share a supervisor instance — cache is keyed by `organizationId`.

**spawnAgent Tool** (`agents/factory/spawnAgent.ts`)

```
Input: name, description, systemPrompt, task, allowedActions[], persist?

Guards:
- allowedActions ⊆ SPAWNABLE_ACTIONS whitelist
- caller spawnDepth < MAX_SPAWN_DEPTH (2)
- persist=true only when caller isTopLevel=true

1. Build ephemeral agent, no checkpointer, fresh uuid threadId
2. Invoke with task
3. If persist=true → insert AgentConfig with spawnedBy = caller agentId
4. Return result string
```

**Spawn Permission Matrix**

| Caller           | canSpawn | Can Persist | Max Depth |
|------------------|----------|-------------|-----------|
| Admin Supervisor | Yes      | Yes         | 2         |
| Employee Agent   | Yes      | No          | 1         |
| Spawned Agent    | No       | No          | 0         |

**Composio** (`agents/tools/composioClient.ts`): single `ComposioToolSet` singleton. Tools always fetched with `entityId = userId` so every call uses that user's OAuth tokens. OAuth onboarding is triggered via `POST /api/composio/onboard` when an agent is assigned to an employee — never implement OAuth manually for any third-party service.

**Checkpointing**: `@langchain/langgraph-checkpoint-postgres`. Passing the same `threadId` to `agent.invoke()` restores full conversation memory. STANDALONE and SUPERVISOR_CALL threadIds use different patterns — never mix them.

**Streaming**: `GET /api/conversations/:id/stream` is SSE. LangGraph `streamEvents()` feeds tokens directly into the SSE response. Frontend reads via `EventSource`.

### Database Schema

```prisma
model Organization { id, name, users[], agents[], agentsUpdatedAt DateTime @default(now()) }

model User { id, email, name, role (ADMIN|EMPLOYEE), organizationId,
             assignments[], conversations[] }

model AgentConfig { id, name, description, systemPrompt, tools[], apps[],
                    capabilities[], isTopLevel, canSpawn, spawnedBy?,
                    isEphemeral, spawnDepth, organizationId,
                    assignments[], conversations[], tasks[] }

model AgentAssignment { userId, agentId  @@unique([userId, agentId]) }

model Conversation { id, userId, agentId, threadId (unique), title?,
                     mode (STANDALONE|SUPERVISOR_CALL), messages[] }

model Message { id, conversationId, role, content, createdAt }

model Task { id, agentId, assignedBy, description,
             status (PENDING|RUNNING|DONE|FAILED), result? }
```

### Multi-Tenancy

JWT middleware extracts `organizationId` → `req.org`. Every DB query must filter by `organizationId`. Agents, employees, and conversations from one org are never visible to another.

---

## Key Invariants

1. Agent behavior is never hardcoded — everything comes from `AgentConfig` in DB.
2. Never implement OAuth or API wrappers for third-party services — always use Composio.
3. Every DB query must be scoped by `organizationId`.
4. Never reuse a `threadId` across users or across STANDALONE/SUPERVISOR_CALL modes.
5. Supervisor is cached per org and rebuilt only when `agentsUpdatedAt` advances — always update `agentsUpdatedAt` on any agent create/update/delete.
6. Enforce `spawnDepth` and `persist` rules strictly inside `spawnAgent.ts`.
7. All agent responses stream via SSE — never wait for full completion.
8. Admin routes must never be accessible to employees and vice versa.

---

## API Routes

```
POST /api/auth/login, /api/auth/register

GET|POST        /api/agents
GET|PUT|DELETE  /api/agents/:agentId

GET|POST        /api/employees
GET             /api/employees/:userId
POST|DELETE     /api/employees/:userId/assign[/:agentId]

GET|POST        /api/conversations
GET             /api/conversations/:id/messages
POST            /api/conversations/:id/messages
GET             /api/conversations/:id/stream   (SSE)

GET             /api/tasks
GET             /api/tasks/:taskId

POST            /api/composio/onboard
GET             /api/composio/callback
GET             /api/composio/status/:userId
```
