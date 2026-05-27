# CODING_STYLE.md

## Philosophy

Minimal. Modular. No abstraction until there are 3+ real use cases for it.

---

## Folder Structure

### Backend
```
src/
  agents/
    factory/      # agentFactory.ts, supervisorFactory.ts, spawnAgent.ts
    tools/        # composioClient.ts, toolRegistry.ts
  api/
    routes/       # one file per resource: agents.ts, employees.ts, conversations.ts
    middleware/   # auth.ts, orgScope.ts, errorHandler.ts
  graphs/         # agentGraph.ts, supervisorGraph.ts
  db/             # client.ts only
```

### Frontend
```
app/
  (auth)/         # sign-in, sign-up
  (admin)/        # admin pages
  (employee)/     # employee pages
components/       # only components used in 2+ pages
lib/              # api-client.ts, utils.ts
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
- Never cache agent instances — always rebuild from `AgentConfig`
- Never implement OAuth manually — always use Composio
- Every DB query must include `organizationId` filter
- All responses stream via SSE — never wait for full completion

### Frontend Specifics
- All backend calls go through `lib/api-client.ts` — never raw `fetch` in components
- No client-side state management library — React state + server components only unless complexity demands otherwise
