import { Router, type Request, type Response } from 'express';
import type { AppConfig, AzureSourceConfig } from '../config.js';
import type { AzureClients } from '../azure/client.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getWorkItemsReport } from '../azure/workItems.js';
import { getIterations, getVelocityOverview, getVelocityReport } from '../azure/iterations.js';
import { getProjects } from '../azure/projects.js';
import { getUserStoriesReport } from '../azure/userStories.js';

/** A resolved source: its axios clients + its config. */
export interface SourceRuntime {
  clients: AzureClients;
  source: AzureSourceConfig;
}

export type SourceRegistry = Record<string, SourceRuntime>;

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Builds the /api router. Every Azure DevOps organization is exposed under
 * /api/:source/... so each dashboard can target its own org while the PATs stay
 * on the server.
 */
export function createApiRouter(registry: SourceRegistry, config: AppConfig): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Available sources (organizations) the frontend can offer.
  router.get('/sources', (_req, res) => {
    res.json(
      Object.values(registry).map(({ source }) => ({
        id: source.id,
        label: source.label,
        org: source.org,
        defaultProject: source.defaultProject,
        primary: source.id === config.primarySourceId,
      })),
    );
  });

  /** Resolves the {clients, source} for :source, or responds 404. */
  function resolve(req: Request, res: Response): SourceRuntime | null {
    const entry = registry[req.params.source];
    if (!entry) {
      res.status(404).json({
        error: 'UnknownSource',
        message: `Fuente "${req.params.source}" no configurada. Disponibles: ${Object.keys(registry).join(', ') || '(ninguna)'}.`,
      });
      return null;
    }
    return entry;
  }

  // Non-secret configuration for a source.
  router.get('/:source/meta', (req, res) => {
    const rt = resolve(req, res);
    if (!rt) return;
    res.json({
      id: rt.source.id,
      label: rt.source.label,
      org: rt.source.org,
      defaultProject: rt.source.defaultProject,
    });
  });

  router.get(
    '/:source/projects',
    asyncHandler(async (req, res) => {
      const rt = resolve(req, res);
      if (!rt) return;
      res.json(await getProjects(rt.clients, rt.source));
    }),
  );

  router.get(
    '/:source/work-items',
    asyncHandler(async (req, res) => {
      const rt = resolve(req, res);
      if (!rt) return;
      const types = queryString(req.query.types)
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      res.json(
        await getWorkItemsReport(rt.clients, rt.source, {
          project: queryString(req.query.project),
          iterationPath: queryString(req.query.iterationPath),
          types,
        }),
      );
    }),
  );

  router.get(
    '/:source/user-stories',
    asyncHandler(async (req, res) => {
      const rt = resolve(req, res);
      if (!rt) return;
      const category = queryString(req.query.category);
      res.json(
        await getUserStoriesReport(rt.clients, rt.source, {
          createdFrom: queryString(req.query.createdFrom),
          closedFrom: queryString(req.query.closedFrom),
          category: category === 'us' || category === 'bugs' ? category : 'all',
        }),
      );
    }),
  );

  router.get(
    '/:source/iterations',
    asyncHandler(async (req, res) => {
      const rt = resolve(req, res);
      if (!rt) return;
      const project = queryString(req.query.project) ?? rt.source.defaultProject;
      if (!project) {
        res.status(400).json({
          error: 'MissingProject',
          message: 'Se requiere el parámetro "project".',
        });
        return;
      }
      res.json(await getIterations(rt.clients, rt.source, project, queryString(req.query.team)));
    }),
  );

  router.get(
    '/:source/velocity',
    asyncHandler(async (req, res) => {
      const rt = resolve(req, res);
      if (!rt) return;
      const project = queryString(req.query.project) ?? rt.source.defaultProject;
      if (!project) {
        res.status(400).json({
          error: 'MissingProject',
          message:
            'La velocity por sprint requiere un "project". Usa /velocity-overview para el comparativo de toda la organización.',
        });
        return;
      }
      const count = Number(queryString(req.query.count)) || undefined;
      res.json(
        await getVelocityReport(rt.clients, rt.source, {
          project,
          team: queryString(req.query.team),
          count,
        }),
      );
    }),
  );

  router.get(
    '/:source/velocity-overview',
    asyncHandler(async (req, res) => {
      const rt = resolve(req, res);
      if (!rt) return;
      const count = Number(queryString(req.query.count)) || undefined;
      res.json(await getVelocityOverview(rt.clients, rt.source, { count }));
    }),
  );

  return router;
}
