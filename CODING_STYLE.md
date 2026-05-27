# CODING_STYLE.md

## Philosophy

Minimal. Modular. No abstraction until there are 3+ real use cases for it.

---

## Folder Structure

### Backend
```
src/
  agents/
    factory/        # mainAgentFactory.ts, subAgentFactory.ts
    prebuilt/
      templates/    # one file per sub agent type (hrTemplate.ts, salesTemplate.ts, …)
      registry.ts   # PREBUILT_AGENTS map: type → template
    reflexive/      # reflexiveAgent.ts, onboardingFlow.ts
    tools/          # composioClient.ts, toolRegistry.ts
  api/
    routes/         # one file per resource: agents.ts, conversations.ts, onboarding.ts, auth.ts
    middleware/     # auth.ts, orgScope.ts, errorHandler.ts
  db/               # client.ts only
  prisma/           # schema.prisma
```

### Frontend
```
app/
  (auth)/           # sign-in, sign-up
  (admin)/
    dashboard/      # page.tsx + all dashboard-specific components
  onboarding/       # page.tsx + page-specific components
components/         # only components used in 2+ pages
lib/                # api-client.ts, auth.ts, utils.ts
middleware.ts       # route protection using JWT cookie
```

---

## Rules

### Files
- One file per responsibility, named exactly what it does
- No barrel files (`index.ts` re-exports) unless unavoidable
- No folder that would only ever contain one file
- Page-specific components live inside the page folder, not in `components/`

### Abstraction
- No `services/`, `repositories/`, `interfaces/`, `dto/` layers
- Route handler calls factory/db directly — no service layer in between
- Do not abstract until the same logic appears in 3+ places

### Code
- No comments unless the WHY is non-obvious
- No unused variables, dead code, or backwards-compat shims
- No error handling for scenarios that cannot happen
- TypeScript strict mode — no `any`
- Prefer `const` over `let`; never `var`

### Naming
- Files: `camelCase.ts`
- Components: `PascalCase.tsx`
- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- DB models: `PascalCase` (Prisma convention)

### Backend Specifics
- Sub agents as Main Agent tools are stateless — no checkpointer, no threadId
- Sub agents in direct-chat mode get a checkpointer — use `buildDirectSubAgent` from `subAgentFactory.ts`
- Main Agent and direct sub-agent instances are cached per org — compare `builtAt` vs `org.agentsUpdatedAt`; always bump `agentsUpdatedAt` on any `AgentConfig` change
- Never implement OAuth manually — always use Composio
- Every DB query must include `organizationId` filter
- All responses stream via SSE — never wait for full completion
- Always use `getSubAgentThreadId(prebuiltType, orgId, userId)` from `subAgentFactory.ts` to construct sub-agent threadIds — never inline the format string

### Frontend Specifics
- No NextAuth — auth is JWT-only; use `lib/auth.ts` helpers to read/write the token cookie
- All backend calls go through `lib/api-client.ts` — never raw `fetch` in components
- No client-side state management library — React state + server components only unless complexity demands otherwise
- `POST /api/conversations` is idempotent — returns existing conversation if threadId already exists; safe to call on every page load
