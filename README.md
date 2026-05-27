# HumanTouch

A multi-tenant agentic SaaS platform where admins create AI agents, assign them to employees, and interact through a supervisor agent powered by LangGraph.

## Roles

- **Admin** — creates agents, assigns them to employees, chats via a supervisor agent that can spawn new agents dynamically
- **Employee** — chats with assigned agents, each with persistent conversation memory
- **Supervisor Agent** — admin's top-level agent, rebuilt from DB on every invoke

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, NextAuth.js v5, TypeScript |
| Backend | Node.js, Express, LangGraph.js, Prisma, PostgreSQL |
| AI Tools | Composio (third-party OAuth + tool integrations) |

## Getting Started

**Backend**
```bash
cd backend
pnpm install
pnpm db:migrate
pnpm dev        # :8000
```

**Frontend**
```bash
cd frontend
pnpm install
pnpm dev        # :3000
```

## Docs

Keep these files up to date as the project evolves:

- `README.md` — update when stack, setup steps, or core features change
- `CLAUDE.md` — update when architecture, invariants, routes, or agent behavior changes
- `CODING_STYLE.md` — update when new patterns are adopted or old ones are dropped

When in doubt, update the relevant doc — a stale doc is worse than no doc.

## Key Features

- Agents are fully config-driven — behavior defined in DB, never hardcoded
- All responses stream via SSE (Server-Sent Events)
- Agents can spawn sub-agents with depth and persist guards
- Full multi-tenancy — all data scoped by `organizationId`
