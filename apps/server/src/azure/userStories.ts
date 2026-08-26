import type { AzureSourceConfig } from '../config.js';
import type { AzureClients } from './client.js';
import type {
  ClientStoryCount,
  MonthClientMatrix,
  MonthCount,
  UserStoriesReport,
  WorkItem,
} from '../types/azure.js';

/** Completed / removed states, matched case-insensitively across processes. */
const COMPLETED_STATES = new Set(['done', 'closed', 'completed', 'resolved']);
const REMOVED_STATES = new Set(['removed', 'cancelled', 'canceled']);

const BASE_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.TeamProject',
  'System.CreatedDate',
  'System.ChangedDate',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.ClosedDate',
];

const BATCH_SIZE = 200;

function escapeWiql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Client derived from the "Client - Project" project-name convention. */
function clientFromProject(project: string): string {
  return project.includes(' - ') ? project.split(' - ')[0].trim() : project;
}

/** ISO month bucket "YYYY-MM" from an ISO date string. */
function monthOf(iso: string | undefined | null): string | null {
  return iso ? iso.slice(0, 7) : null;
}

/** Normalization key so "IKUSI", "Ikusi" and "ikusi" fold into one client. */
function clientKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildWiql(source: AzureSourceConfig): string {
  const { project, types } = source.userStories;
  const clauses: string[] = [];
  if (project) clauses.push(`[System.TeamProject] = '${escapeWiql(project)}'`);
  if (types.length > 0) {
    clauses.push(`[System.WorkItemType] IN (${types.map((t) => `'${escapeWiql(t)}'`).join(', ')})`);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  return `SELECT [System.Id] FROM WorkItems${where} ORDER BY [System.ChangedDate] DESC`;
}

async function fetchBacklogIds(clients: AzureClients, source: AzureSourceConfig): Promise<number[]> {
  const { project } = source.userStories;
  const url = project
    ? `/${encodeURIComponent(project)}/_apis/wit/wiql`
    : `/_apis/wit/wiql`;
  const { data } = await clients.core.post<{ workItems: Array<{ id: number }> }>(
    url,
    { query: buildWiql(source) },
    { params: { 'api-version': source.apiVersion } },
  );
  return (data.workItems ?? []).map((w) => w.id);
}

async function fetchDetails(
  clients: AzureClients,
  source: AzureSourceConfig,
  ids: number[],
  fields: string[],
): Promise<WorkItem[]> {
  const results: WorkItem[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const { data } = await clients.core.post<{ value: WorkItem[] }>(
      `/_apis/wit/workitemsbatch`,
      { ids: ids.slice(i, i + BATCH_SIZE), fields },
      { params: { 'api-version': source.apiVersion } },
    );
    results.push(...(data.value ?? []));
  }
  return results;
}

function emptyReport(): UserStoriesReport {
  return {
    totalStories: 0,
    totalOpen: 0,
    totalResolved: 0,
    byClient: [],
    finishedByMonth: [],
    openByMonthByClient: { months: [], series: [] },
  };
}

/** Picks the most frequent original spelling for each normalized client key. */
function resolveDisplayNames(variants: Map<string, Map<string, number>>): Map<string, string> {
  const display = new Map<string, string>();
  for (const [key, counts] of variants) {
    let best = '';
    let bestCount = -1;
    for (const [variant, count] of counts) {
      if (count > bestCount) {
        best = variant;
        bestCount = count;
      }
    }
    display.set(key, best);
  }
  return display;
}

/** Runtime filters applied before aggregation (lower bounds, inclusive). */
export interface UserStoriesFilters {
  /** Keep items created on/after this ISO date (yyyy-mm-dd). */
  createdFrom?: string;
  /** Keep items closed on/after this ISO date (yyyy-mm-dd). */
  closedFrom?: string;
}

/** Inclusive lower-bound compare of an ISO datetime against a yyyy-mm-dd bound. */
function onOrAfter(iso: string | undefined | null, bound: string): boolean {
  return typeof iso === 'string' && iso.slice(0, 10) >= bound;
}

/**
 * "User stories" report grouped by client for a source. The client comes from
 * `source.userStories.clientField` when set (e.g. Custom.Cliente), otherwise
 * from the project-name prefix. Removed items are excluded; resolved/finished =
 * a completed state; open = anything not completed and not removed.
 *
 * `filters.createdFrom` / `filters.closedFrom` narrow the dataset (by
 * System.CreatedDate / Microsoft.VSTS.Common.ClosedDate) before aggregating, so
 * every KPI and chart reflects the selected window.
 */
export async function getUserStoriesReport(
  clients: AzureClients,
  source: AzureSourceConfig,
  filters: UserStoriesFilters = {},
): Promise<UserStoriesReport> {
  const { clientField } = source.userStories;
  const fields = clientField ? [...BASE_FIELDS, clientField] : BASE_FIELDS;

  const ids = await fetchBacklogIds(clients, source);
  if (ids.length === 0) return emptyReport();

  const all = await fetchDetails(clients, source, ids, fields);

  const items = all.filter((item) => {
    const f = item.fields;
    if (filters.createdFrom && !onOrAfter(f['System.CreatedDate'] as string, filters.createdFrom)) {
      return false;
    }
    if (
      filters.closedFrom &&
      !onOrAfter(f['Microsoft.VSTS.Common.ClosedDate'] as string, filters.closedFrom)
    ) {
      return false;
    }
    return true;
  });
  if (items.length === 0) return emptyReport();

  const rawClientOf = (item: WorkItem): string => {
    if (clientField) {
      const value = item.fields[clientField];
      const str = typeof value === 'string' ? value.trim() : '';
      return str || 'Sin cliente';
    }
    return clientFromProject(String(item.fields['System.TeamProject'] ?? 'Sin proyecto'));
  };

  // Pass 1: pick a canonical display name per normalized client key.
  const variants = new Map<string, Map<string, number>>();
  for (const item of items) {
    const raw = rawClientOf(item);
    const key = clientKey(raw);
    const counts = variants.get(key) ?? new Map<string, number>();
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    variants.set(key, counts);
  }
  const displayNames = resolveDisplayNames(variants);

  // Pass 2: aggregate.
  let totalOpen = 0;
  let totalResolved = 0;
  const byClient = new Map<string, ClientStoryCount>();
  const finished = new Map<string, number>();
  const openMonthClient = new Map<string, Map<string, number>>();
  const clientsWithOpen = new Set<string>();

  for (const item of items) {
    const f = item.fields;
    const state = String(f['System.State'] ?? '').toLowerCase();
    if (REMOVED_STATES.has(state)) continue;

    const client = displayNames.get(clientKey(rawClientOf(item))) ?? 'Sin cliente';
    const bucket = byClient.get(client) ?? { client, open: 0, resolved: 0, total: 0 };

    if (COMPLETED_STATES.has(state)) {
      totalResolved += 1;
      bucket.resolved += 1;
      const m = monthOf(
        (f['Microsoft.VSTS.Common.ClosedDate'] as string) ??
          (f['Microsoft.VSTS.Common.StateChangeDate'] as string) ??
          (f['System.ChangedDate'] as string),
      );
      if (m) finished.set(m, (finished.get(m) ?? 0) + 1);
    } else {
      totalOpen += 1;
      bucket.open += 1;
      clientsWithOpen.add(client);
      const m = monthOf(f['System.CreatedDate'] as string);
      if (m) {
        const perClient = openMonthClient.get(m) ?? new Map<string, number>();
        perClient.set(client, (perClient.get(client) ?? 0) + 1);
        openMonthClient.set(m, perClient);
      }
    }

    bucket.total = bucket.open + bucket.resolved;
    byClient.set(client, bucket);
  }

  const finishedByMonth: MonthCount[] = [...finished.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const months = [...openMonthClient.keys()].sort((a, b) => a.localeCompare(b));
  const clientList = [...clientsWithOpen].sort();
  const openByMonthByClient: MonthClientMatrix = {
    months,
    series: clientList.map((client) => ({
      client,
      data: months.map((m) => openMonthClient.get(m)?.get(client) ?? 0),
    })),
  };

  return {
    totalStories: totalOpen + totalResolved,
    totalOpen,
    totalResolved,
    byClient: [...byClient.values()].sort((a, b) => b.total - a.total),
    finishedByMonth,
    openByMonthByClient,
  };
}
