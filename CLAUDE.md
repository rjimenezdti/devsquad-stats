# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DevSquad Stats: dashboards with statistics for the team's projects, fed from **Azure DevOps**. The browser never touches Azure DevOps directly — a backend Express proxy holds the Personal Access Tokens (PATs) and calls the Azure DevOps REST API, because the PAT must stay server-side and Azure DevOps does not support CORS.

npm workspaces monorepo (`apps/*`), Node >= 20, ESM throughout:

- `apps/server` — `@devsquad-stats/server`: Express + TypeScript proxy over the Azure DevOps REST API.
- `apps/web` — `@devsquad-stats/web`: React 18 + Vite + TypeScript SPA. React Query for data, React Router, ApexCharts for charts, Bootstrap 5 + a vendored AdminKit theme (SCSS).

## Commands

Run from the repo root (they delegate to the workspaces):

```bash
npm install              # also runs postinstall -> setup:rollup-wasm (see below)
npm run dev              # server (tsx watch, :4000) + web (vite, :5173) concurrently
npm run dev:server       # backend only
npm run dev:web          # frontend only (its /api is proxied to :4000 by Vite)
npm run build            # build server (tsc) then web (tsc -b + vite build)
npm run typecheck        # tsc --noEmit across both workspaces
npm start                # run the built server (node apps/server/dist/index.js)
```

There is no test runner and no ESLint config wired up. `typecheck` is the primary correctness gate — run it after changes. (The `eslint-disable` comments in the code are inert.)

### Rollup/WASM workaround (this machine)

On this Windows machine, Application Control (WDAC) blocks unsigned native `.node` binaries under `node_modules`, which breaks Rollup — and therefore both `vite` dev and `vite build`. `scripts/use-rollup-wasm.mjs` rewrites the `@rollup/rollup-*` native packages to re-export the pure-WASM `@rollup/wasm-node` build. It runs on `postinstall`. **If install scripts are disabled, run `npm run setup:rollup-wasm` after every `npm install`**, or Vite will fail to start. The script is idempotent.

## Configuration

Backend config is read and validated once at startup in `apps/server/src/config.ts` from `apps/server/.env` (copy from `.env.example`). If a required var is missing, the server throws on boot with a message telling you what to set. `AZDO_ORG` + `AZDO_PAT` are the only required vars.

Frontend uses `apps/web/.env` (`VITE_API_BASE_URL`, defaults to `/api`).

## Architecture

### Multi-organization "sources" model — the central concept

The app queries **two independent Azure DevOps organizations**, modeled as "sources" keyed by a stable `id`. This shows up everywhere: routes are `/api/:source/...`, frontend query keys and hooks all take a `SourceId`.

- **`devprojects`** (primary, required — `AZDO_ORG`/`AZDO_PAT`): the team's projects. Powers the Overview, Work Items, and Velocity dashboards. Org-wide by default with a project selector in the navbar.
- **`keytia`** (optional — `KEYTIA_ORG`/`KEYTIA_PAT`): a *separate* org used as the Keytia ticketing platform. Powers the "User Stories by Client" dashboard at route `/keytia`. Disabled (its endpoints 404) until both env vars are set. **Do not confuse this org with the "Pentafon - Keytia" project that lives inside `devprojects`.**

Sources are built in `loadConfig()` and, at boot (`index.ts`), each becomes a `SourceRuntime` (`{ clients, source }`) in a registry keyed by id. `createApiRouter` looks up `req.params.source` in that registry and 404s on unknown sources. The frontend discovers what's available via `GET /api/sources`.

### Backend request flow

1. `index.ts` — `loadConfig()`, build one set of axios clients per source, mount `helmet` + `cors` + `compression` + the `/api` router + `errorHandler`.
2. `azure/client.ts` — one axios instance per source for the core REST API (`dev.azure.com/{org}`) and one for OData Analytics (`analytics.dev.azure.com/{org}`). Auth is HTTP Basic with an empty username and the PAT as password.
3. `routes/api.ts` — thin HTTP layer: parse query params, `resolve()` the source, call an `azure/*` function, return JSON. Async handlers are wrapped in `asyncHandler` so errors reach `errorHandler`.
4. `azure/*.ts` — the actual Azure DevOps logic and all aggregation. This is where the real work lives:
   - `workItems.ts` — WIQL query (project-scoped or org-wide) returns ids, then `workitemsbatch` hydrates them (**hard 200-ids-per-batch limit**), then aggregates into `byState`/`byType`/`byAssignee`/`byProject`/`storyPointsByState`.
   - `iterations.ts` — velocity. Per-project sprint-by-sprint (`getVelocityReport`) and org-wide comparison (`getVelocityOverview`, which fans out across projects with `mapWithConcurrency`, concurrency 5, and records projects it had to `skip`). "Completed" states are matched case-insensitively against a superset covering Agile/Scrum/CMMI/Basic.
   - `userStories.ts` — the Keytia "by client" report; see below.
   - `projects.ts` — lists org projects.
5. `middleware/errorHandler.ts` — turns axios errors into clean JSON. **401/403 are surfaced as-is with a "check the PAT/scopes" message; every other Azure failure is normalized to 502.** Never leaks the PAT or stack traces.

### "Client" grouping (userStories.ts) — subtle, org-dependent

How a work item maps to a "Cliente" depends on the source config (`source.userStories.clientField`):

- If `clientField` is set (Keytia uses `Custom.Cliente`), the client is that field's value.
- If empty, the client is derived from the **project-name prefix** using the `"Client - Project"` naming convention (e.g. `"Pentafon - Keytia"` → `Pentafon`).

Client names are normalized case- and whitespace-insensitively (so `IKUSI`/`Ikusi`/`ikusi` fold together), and the displayed label is the most frequent original spelling. State semantics: **Removed/cancelled excluded; Done/Closed/Resolved/Completed = resolved; anything else = open.** `createdFrom`/`closedFrom` filters narrow the dataset before aggregating so every KPI and chart reflects the window.

### Frontend data flow

`main.tsx` wires `QueryClientProvider` → `ProjectProvider` → `RouterProvider`.

- `lib/apiClient.ts` — axios pointed at the backend (`/api`). `toErrorMessage()` extracts the backend's error message shape.
- `features/azure/api.ts` — one function per endpoint; `SOURCE` enum for source ids.
- `features/azure/hooks.ts` — React Query hooks (`useWorkItems`, `useVelocity`, `useVelocityOverview`, `useUserStories`, ...). Query keys live in `azureKeys`. Reference data (`sources`, `meta`, `projects`) uses `staleTime: Infinity`. Note the deliberate `enabled` guards: `useVelocity` runs only when a project is selected; `useVelocityOverview` only when one isn't.
- `features/project/ProjectContext.tsx` — the selected project (empty string = "all projects / org-wide"), persisted to `localStorage`. This drives most dashboards.
- Pages: `OverviewPage`, `WorkItemsPage`, `VelocityPage`, `ClientsPage` (the `/keytia` route). Charts wrap ApexCharts in `components/charts/*`.

Path alias: `@/` → `apps/web/src/` (configured in both `vite.config.ts` and tsconfig).

### Styling

Bootstrap 5 + a vendored AdminKit theme compiled from SCSS. Entry is `apps/web/src/scss/app.scss`, which pulls Bootstrap partials from `node_modules` (Vite's sass `loadPaths`) and then the theme's `1-variables` / `2-mixins` / `3-components` / `4-utilities` partials. Legacy `@import` deprecation warnings from Bootstrap/AdminKit are intentionally silenced in `vite.config.ts`.

## Security notes

- The PAT is server-only by design. Never introduce it into `apps/web` or any client-shipped bundle, and never log it. `apps/*/.env` must stay out of version control.
- Azure DevOps PATs should be read-only (Work Items: Read, Analytics: Read).
- WIQL string values are escaped (`escapeWiql`, doubling single quotes) before interpolation — keep that up if you add filters.
