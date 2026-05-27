# HumanTouch

A multi-tenant agentic SaaS platform where solo founders and freelancers get an AI team — a Main Agent (chief-of-staff) backed by 10 pre-built specialist Sub Agents.

## How It Works

Every organization gets:
- **Main Agent** — the admin's primary AI; orchestrates Sub Agents as tools for complex, multi-step work
- **10 Sub Agents** — HR, Sales, Finance, Marketing, Legal, and more; each independently chatbable or delegated to by the Main Agent

The admin can chat with the Main Agent for orchestrated work, or go directly to any Sub Agent for focused tasks. All conversations have persistent history.

## Roles

- **Admin** — completes onboarding, then uses the dashboard to chat with Main Agent or any Sub Agent
- **Main Agent** — top-level AI; routes tasks to Sub Agents as tools; cached per org
- **Sub Agents (10)** — stateless as tools, persistent when chatted with directly
- **Reflexive Agent** — ephemeral; used only during onboarding to generate system prompts; never stored

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14+, TypeScript |
| Backend | Node.js, Express, LangGraph.js, Prisma, PostgreSQL |
| AI | Claude Sonnet 4.6 via LangGraph `createReactAgent` |
| Auth | JWT (HS256), email + password, httpOnly cookie |
| Tools | Composio (OAuth + third-party integrations) |

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

## SSE Event Types

| Event | When |
|---|---|
| `main_token` | Main Agent generating tokens |
| `subagent_start` | Main Agent delegating to a Sub Agent |
| `subagent_token` | Sub Agent tokens during Main Agent orchestration |
| `subagent_direct_token` | Admin chatting directly with a Sub Agent |
| `error` | Tool not connected or fatal error |

## Key Invariants

- Agent behavior is never hardcoded — system prompts always come from DB
- Never implement OAuth manually — always use Composio
- Every DB query must be scoped by `organizationId`
- All responses stream via SSE — never wait for full completion
- Onboarding must complete before the dashboard is accessible

## Docs

Keep these files up to date as the project evolves:

- `README.md` — update when stack, setup steps, or core features change
- `CLAUDE.md` — update when architecture, invariants, routes, or agent behavior changes
- `CODING_STYLE.md` — update when new patterns are adopted or old ones are dropped

When in doubt, update the relevant doc — a stale doc is worse than no doc.
