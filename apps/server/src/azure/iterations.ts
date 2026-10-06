import { isAxiosError } from 'axios';
import { defaultTeamFor, type AzureSourceConfig } from '../config.js';
import type { AzureClients } from './client.js';
import type {
  Iteration,
  ProjectVelocity,
  SprintVelocity,
  VelocityOverview,
  VelocityReport,
} from '../types/azure.js';
import { getWorkItemsReport } from './workItems.js';
import { getProjects } from './projects.js';
import { mapWithConcurrency } from '../util/pool.js';

/**
 * State names considered "done" when computing completed story points.
 * Azure DevOps process templates use different names, so we match a superset
 * (Agile, Scrum, CMMI, Basic) case-insensitively.
 */
const COMPLETED_STATES = new Set(
  ['done', 'closed', 'completed', 'resolved'].map((s) => s.toLowerCase()),
);

/** Concurrency when fanning out velocity computation across projects. */
const PROJECT_CONCURRENCY = 5;

/**
 * Only iterations whose name is a "yyyyMMdd-yyyyMMdd" date range (sprint
 * start-end) are surfaced; anything else in the tree is ignored.
 */
const SPRINT_NAME_PATTERN = /^\d{8}-\d{8}$/;

/** A node in the project's iteration classification tree. */
interface RawIterationNode {
  id: number;
  identifier: string;
  name: string;
  attributes?: {
    startDate?: string | null;
    finishDate?: string | null;
  };
  hasChildren?: boolean;
  children?: RawIterationNode[];
}

/**
 * Classification nodes expose start/finish dates but not Azure's "timeFrame"
 * (past/current/future), which the velocity logic relies on, so we derive it
 * from the dates. Undated iterations are "unknown" — treated as started, so
 * `recentStartedSprints` never filters them out as future.
 */
function deriveTimeFrame(
  startDate: string | null,
  finishDate: string | null,
): Iteration['timeFrame'] {
  const now = Date.now();
  const start = startDate ? new Date(startDate).getTime() : null;
  const finish = finishDate ? new Date(finishDate).getTime() : null;
  if (start === null && finish === null) return 'unknown';
  if (start !== null && now < start) return 'future';
  if (finish !== null && now > finish) return 'past';
  return 'current';
}

/**
 * Flattens the iteration tree into its leaf sprints. The `path` is rebuilt from
 * the node names (rooted at the project name) so it matches `System.IterationPath`
 * used by WIQL — the raw node `path` has a different shape (`\Project\Iteration\…`).
 * The depth-0 project root is never a selectable sprint; container nodes (e.g. a
 * "Release 1" holding sprints) are skipped so velocity never double-counts a
 * parent's `UNDER` query against its children.
 */
function collectLeafIterations(
  node: RawIterationNode,
  parentPath: string,
  depth: number,
  out: Iteration[],
): void {
  const path = depth === 0 ? node.name : `${parentPath}\\${node.name}`;
  const children = node.children ?? [];

  if (depth > 0 && children.length === 0) {
    const startDate = node.attributes?.startDate ?? null;
    const finishDate = node.attributes?.finishDate ?? null;
    out.push({
      id: node.identifier ?? String(node.id),
      name: node.name,
      path,
      startDate,
      finishDate,
      timeFrame: deriveTimeFrame(startDate, finishDate),
    });
  }

  for (const child of children) {
    collectLeafIterations(child, path, depth + 1, out);
  }
}

/**
 * Sprints for a project, read from the project's iteration tree (Project
 * Settings → iterations / classification nodes) rather than a team's selected
 * backlog iterations. Returns the leaf iterations across the whole tree.
 */
export async function getIterations(
  clients: AzureClients,
  source: AzureSourceConfig,
  project: string,
): Promise<Iteration[]> {
  const { data } = await clients.core.get<RawIterationNode>(
    `/${encodeURIComponent(project)}/_apis/wit/classificationnodes/iterations`,
    { params: { 'api-version': source.apiVersion, $depth: 10 } },
  );

  const iterations: Iteration[] = [];
  collectLeafIterations(data, '', 0, iterations);
  return iterations
    .filter((it) => SPRINT_NAME_PATTERN.test(it.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function summarizeSprint(
  it: Iteration,
  storyPointsByState: { key: string; count: number }[],
): SprintVelocity {
  let planned = 0;
  let completed = 0;
  for (const bucket of storyPointsByState) {
    planned += bucket.count;
    if (COMPLETED_STATES.has(bucket.key.toLowerCase())) completed += bucket.count;
  }
  return {
    iterationName: it.name,
    iterationPath: it.path,
    startDate: it.startDate,
    finishDate: it.finishDate,
    planned,
    completed,
    incomplete: Math.max(0, planned - completed),
  };
}

function averageOf(sprints: SprintVelocity[]): number {
  const completed = sprints.filter((s) => s.completed > 0);
  if (completed.length === 0) return 0;
  return Math.round(completed.reduce((sum, s) => sum + s.completed, 0) / completed.length);
}

/** Sprints that have already started, most recent last, capped to `count`. */
function recentStartedSprints(iterations: Iteration[], count: number): Iteration[] {
  return iterations
    .filter((it) => it.timeFrame !== 'future')
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .slice(-count);
}

/**
 * Sprint-by-sprint velocity for a single project/team. Planned = all story
 * points in the sprint; completed = points in a done state.
 */
export async function getVelocityReport(
  clients: AzureClients,
  source: AzureSourceConfig,
  options: { project: string; team?: string; count?: number },
): Promise<VelocityReport> {
  const { project } = options;
  const team = options.team ?? defaultTeamFor(project);
  const count = options.count ?? 6;

  const iterations = await getIterations(clients, source, project);
  const relevant = recentStartedSprints(iterations, count);

  const sprints: SprintVelocity[] = [];
  for (const it of relevant) {
    const report = await getWorkItemsReport(clients, source, {
      project,
      iterationPath: it.path,
    });
    sprints.push(summarizeSprint(it, report.storyPointsByState));
  }

  return { project, team, sprints, averageVelocity: averageOf(sprints) };
}

/**
 * Organization-wide velocity: one summary row per project (average velocity
 * over the last `count` sprints + latest sprint numbers). Projects without team
 * iterations or that error are reported under `skipped`.
 */
export async function getVelocityOverview(
  clients: AzureClients,
  source: AzureSourceConfig,
  options: { count?: number } = {},
): Promise<VelocityOverview> {
  const count = options.count ?? 3;
  const projects = await getProjects(clients, source);
  const skipped: string[] = [];

  const rows = await mapWithConcurrency(
    projects,
    PROJECT_CONCURRENCY,
    async (project): Promise<ProjectVelocity | null> => {
      const team = defaultTeamFor(project.name);
      try {
        const iterations = await getIterations(clients, source, project.name);
        const relevant = recentStartedSprints(iterations, count);
        if (relevant.length === 0) {
          skipped.push(project.name);
          return null;
        }

        const sprints: SprintVelocity[] = [];
        for (const it of relevant) {
          const report = await getWorkItemsReport(clients, source, {
            project: project.name,
            iterationPath: it.path,
          });
          sprints.push(summarizeSprint(it, report.storyPointsByState));
        }

        const last = sprints[sprints.length - 1];
        return {
          project: project.name,
          team,
          averageVelocity: averageOf(sprints),
          lastSprintName: last?.iterationName ?? null,
          lastSprintCompleted: last?.completed ?? 0,
          lastSprintPlanned: last?.planned ?? 0,
        };
      } catch (err) {
        // A project may not have the default team or agile boards configured.
        if (isAxiosError(err)) {
          skipped.push(project.name);
          return null;
        }
        throw err;
      }
    },
  );

  const projectsOut = rows
    .filter((r): r is ProjectVelocity => r !== null)
    .sort((a, b) => b.averageVelocity - a.averageVelocity);

  return { projects: projectsOut, skipped };
}
