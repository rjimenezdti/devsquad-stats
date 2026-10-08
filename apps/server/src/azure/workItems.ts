import { isProjectExcluded, type AzureSourceConfig } from '../config.js';
import type { AzureClients } from './client.js';
import type {
  CountBucket,
  WorkItem,
  WorkItemSummary,
  WorkItemsReport,
} from '../types/azure.js';

export interface WorkItemsQuery {
  /** When omitted, the query runs across ALL projects in the organization. */
  project?: string;
  /** Restrict to a single iteration (e.g. "MyProject\\Sprint 12"). */
  iterationPath?: string;
  /** Filter by work item types, e.g. ["Bug", "User Story"]. */
  types?: string[];
}

const DEFAULT_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.TeamProject',
  'System.AssignedTo',
  'System.IterationPath',
  'System.Tags',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Custom.EstimatedEfforthrs',
  'Custom.Type',
];

/** WIQL only returns ids; batch has a hard limit of 200 ids per request. */
const BATCH_SIZE = 200;

function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildWiql(query: WorkItemsQuery): string {
  const clauses: string[] = [];

  if (query.project) {
    clauses.push(`[System.TeamProject] = '${escapeWiql(query.project)}'`);
  }
  if (query.iterationPath) {
    clauses.push(`[System.IterationPath] UNDER '${escapeWiql(query.iterationPath)}'`);
  }
  if (query.types && query.types.length > 0) {
    const list = query.types.map((t) => `'${escapeWiql(t)}'`).join(', ');
    clauses.push(`[System.WorkItemType] IN (${list})`);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  return (
    `SELECT [System.Id] FROM WorkItems${where} ` + `ORDER BY [System.ChangedDate] DESC`
  );
}

function displayNameOf(assignedTo: unknown): string {
  if (!assignedTo) return 'Unassigned';
  if (typeof assignedTo === 'string') return assignedTo;
  if (typeof assignedTo === 'object' && 'displayName' in (assignedTo as object)) {
    return (assignedTo as { displayName: string }).displayName;
  }
  return 'Unassigned';
}

function toSummary(item: WorkItem): WorkItemSummary {
  const f = item.fields;
  const points = f['Microsoft.VSTS.Scheduling.StoryPoints'];
  const impact = f['Custom.EstimatedEfforthrs'];
  const tags = (f['System.Tags'] as string | undefined)?.split(';').map((t) => t.trim());

  return {
    id: f['System.Id'],
    title: f['System.Title'],
    state: f['System.State'] ?? 'Unknown',
    type: f['System.WorkItemType'] ?? 'Unknown',
    project: (f['System.TeamProject'] as string) ?? 'Unknown',
    assignedTo: displayNameOf(f['System.AssignedTo']),
    iterationPath: (f['System.IterationPath'] as string) ?? '',
    storyPoints: typeof points === 'number' ? points : null,
    estimatedImpact: typeof impact === 'number' ? impact : null,
    workType: (f['Custom.Type'] as string | undefined) ?? 'Sin clasificar',
    tags: tags?.filter(Boolean) ?? [],
  };
}

function countBy(items: WorkItemSummary[], selector: (i: WorkItemSummary) => string): CountBucket[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = selector(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function sumBy(
  items: WorkItemSummary[],
  groupBy: (i: WorkItemSummary) => string,
  value: (i: WorkItemSummary) => number,
): CountBucket[] {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(groupBy(item), (map.get(groupBy(item)) ?? 0) + value(item));
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

async function fetchIds(
  clients: AzureClients,
  source: AzureSourceConfig,
  query: WorkItemsQuery,
): Promise<number[]> {
  // Project-scoped endpoint when a project is given, else org-wide WIQL.
  const url = query.project
    ? `/${encodeURIComponent(query.project)}/_apis/wit/wiql`
    : `/_apis/wit/wiql`;
  const { data } = await clients.core.post<{ workItems: Array<{ id: number }> }>(
    url,
    { query: buildWiql(query) },
    { params: { 'api-version': source.apiVersion } },
  );
  return (data.workItems ?? []).map((w) => w.id);
}

async function fetchDetails(
  clients: AzureClients,
  source: AzureSourceConfig,
  ids: number[],
): Promise<WorkItem[]> {
  const results: WorkItem[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { data } = await clients.core.post<{ value: WorkItem[] }>(
      `/_apis/wit/workitemsbatch`,
      { ids: chunk, fields: DEFAULT_FIELDS },
      { params: { 'api-version': source.apiVersion } },
    );
    results.push(...(data.value ?? []));
  }
  return results;
}

function emptyReport(): WorkItemsReport {
  return {
    total: 0,
    byState: [],
    byType: [],
    byAssignee: [],
    byProject: [],
    storyPointsByState: [],
    items: [],
  };
}

/**
 * Runs a WIQL query (org-wide unless a project is given), hydrates the matching
 * work items and aggregates them into the report the dashboards consume.
 */
export async function getWorkItemsReport(
  clients: AzureClients,
  source: AzureSourceConfig,
  query: WorkItemsQuery = {},
): Promise<WorkItemsReport> {
  const ids = await fetchIds(clients, source, query);
  if (ids.length === 0) return emptyReport();

  const details = await fetchDetails(clients, source, ids);
  // Drop items from excluded projects (relevant for org-wide queries, which span
  // every project the PAT can see).
  const items = details.map(toSummary).filter((i) => !isProjectExcluded(source, i.project));
  if (items.length === 0) return emptyReport();

  return {
    total: items.length,
    byState: countBy(items, (i) => i.state),
    byType: countBy(items, (i) => i.type),
    byAssignee: countBy(items, (i) => i.assignedTo),
    byProject: countBy(items, (i) => i.project),
    storyPointsByState: sumBy(
      items,
      (i) => i.state,
      (i) => i.storyPoints ?? 0,
    ),
    items,
  };
}
