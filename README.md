# DevSquad Stats

Dashboards con estadísticas de los proyectos del equipo, alimentados desde
**Azure DevOps**. Frontend en **React + TypeScript (Vite)** con el diseño de
**AdminKit**, y un **backend proxy** en Node/Express que resguarda el Personal
Access Token del lado del servidor.

## Arquitectura

```
devsquad-stats/
├── apps/
│   ├── web/      React 18 + Vite + TypeScript (UI, gráficos ApexCharts, React Query)
│   └── server/   Express + TypeScript (proxy a la REST API de Azure DevOps)
└── scripts/      utilidades de build
```

El navegador **nunca** habla directamente con Azure DevOps (no soporta CORS y
expondría el token). El flujo es:

```
React (web) ──/api──▶ Express (server) ──Basic auth + PAT──▶ Azure DevOps REST API
```

Los dashboards muestran datos de **todos los proyectos de la organización** por
defecto; un **selector de proyecto** en la barra superior permite acotar a uno.

**Dashboards disponibles:** Resumen, Work Items, **User Stories por Cliente**, Velocity.

La app consulta **dos organizaciones independientes de Azure DevOps** ("sources"):

- **devprojects** (`AZDO_ORG`) — los proyectos del equipo. Dashboards: Resumen,
  Work Items, Velocity. Org-wide con selector de proyecto.
- **keytia** (`KEYTIA_ORG`) — organización de tickets del sistema Keytia. Dashboard
  **User Stories por Cliente**, acotado al proyecto `KEYTIA_PROJECT`
  (`KeytiaDev Backlog`) y agrupado por el campo `KEYTIA_CLIENT_FIELD`
  (`Custom.Cliente`). *Abierto* = estado no terminado; *Resuelto/Finalizado* =
  estado completado (Closed/Resolved/Done), por mes de cierre. Los nombres de
  cliente se normalizan (p. ej. `IKUSI`/`Ikusi`/`ikusi` → un solo cliente).

Cada source se consulta bajo `/api/:source/...` y usa su propio PAT.

- **`apps/server`** guarda el PAT en `apps/server/.env` (gitignored) y expone
  endpoints limpios:
  - `GET /api/projects` — todos los proyectos de la organización
  - `GET /api/work-items[?project=]` — work items (org-wide o por proyecto)
  - `GET /api/user-stories` — user stories agrupadas por **cliente** (org-wide)
  - `GET /api/velocity?project=` — velocity sprint-a-sprint de un proyecto
  - `GET /api/velocity-overview` — velocity promedio por proyecto (comparativo org-wide)
  - `GET /api/iterations?project=` — sprints de un proyecto
  - `GET /api/meta`, `GET /api/health`
- **`apps/web`** consume esos endpoints con React Query. En desarrollo, Vite
  hace proxy de `/api` al backend (`localhost:4000`).

## Requisitos

- Node.js >= 20 (ver `.nvmrc`)

## Configuración

1. **Instala dependencias** (desde la raíz):

   ```bash
   npm install
   ```

2. **Configura el backend**. Copia el ejemplo y rellena tus valores:

   ```bash
   cp apps/server/.env.example apps/server/.env
   ```

   | Variable         | Descripción                                                        |
   | ---------------- | ------------------------------------------------------------------ |
   | `AZDO_ORG`       | **(Requerido)** Organización: el `{org}` de `https://dev.azure.com/{org}` |
   | `AZDO_PROJECT`   | (Opcional) Proyecto a preseleccionar en el filtro; los dashboards agregan **todos** por defecto |
   | `AZDO_PAT`       | Personal Access Token (ver scopes abajo)                           |
   | `AZDO_API_VERSION` | Versión de la API REST (default `7.1`)                           |
   | `PORT`           | Puerto del backend (default `4000`)                                |
   | `CORS_ORIGIN`    | Orígenes permitidos (default `http://localhost:5173`)              |

   > La velocity por proyecto asume el equipo por defecto `"<proyecto> Team"`.
   > Los proyectos sin ese equipo o sin sprints se listan como "sin datos".

   **Scopes mínimos del PAT** (solo lectura):
   - **Work Items (Read)**
   - **Analytics (Read)** — para velocity/burndown

3. **(Opcional) Configura el frontend**. Sólo si cambias la URL del backend:

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

## Ejecutar en desarrollo

Levanta backend + frontend juntos:

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000/api/health

## Build de producción

```bash
npm run build      # compila server (dist/) y web (dist/)
npm start          # sirve el backend ya compilado
```

El frontend compilado queda en `apps/web/dist/` (servir con cualquier estático,
p. ej. detrás del mismo backend o un CDN, apuntando `VITE_API_BASE_URL` al proxy).

## Seguridad

- ⚠️ **El PAT nunca va en el código ni en el repo.** Vive en `apps/server/.env`,
  que está en `.gitignore`.
- Si un PAT se filtra (por ejemplo, al compartirlo en un chat o commit),
  **revócalo y genera uno nuevo** en Azure DevOps → *User settings → Personal
  Access Tokens*.
- El backend solo devuelve datos agregados; el token no llega jamás al navegador.

## Notas de compatibilidad (Windows / Application Control)

En máquinas con **Windows Application Control / WDAC** que bloquean binarios
nativos (`.node`) sin firmar, Rollup falla al cargar (`ERR_DLOPEN_FAILED`). Este
repo redirige Rollup a su build **WASM** (`@rollup/wasm-node`) mediante
`scripts/use-rollup-wasm.mjs`, ejecutado en `postinstall`. Si tu entorno
deshabilita los scripts de instalación, córrelo a mano:

```bash
npm run setup:rollup-wasm
```

## Stack

- **UI**: React 18, React Router, diseño AdminKit (Bootstrap 5 + SCSS)
- **Estado servidor**: TanStack Query (React Query)
- **Gráficos**: ApexCharts (`react-apexcharts`)
- **Backend**: Express, Axios, Helmet, Compression
- **Tooling**: Vite, TypeScript, tsx, npm workspaces
