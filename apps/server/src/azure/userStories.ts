import { isAxiosError } from 'axios';
import type { AzureSourceConfig } from '../config.js';
import type { AzureClients } from './client.js';
import type {
  ClientStoryCount,
  ClientTypeMatrix,
  StoryListItem,
  UserStoriesReport,
  WorkItem,
} from '../types/azure.js';

/**
 * Dashboard scope: an item is "open" when its state is neither Closed nor
 * Resolved. Removed items stay excluded (as before). Matched case-insensitively.
 */
const NOT_OPEN_STATES = new Set(['closed', 'resolved', 'removed', 'cancelled', 'canceled']);

function isOpenState(state: string): boolean {
  return !NOT_OPEN_STATES.has(state.trim().toLowerCase());
}

/** WIQL clause restricting results to open items (Closed/Resolved/Removed out). */
function openStateClause(): string {
  return `[System.State] NOT IN ('Closed', 'Resolved', 'Removed')`;
}

const BASE_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.TeamProject',
  'System.CreatedDate',
  'System.CreatedBy',
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

/** Display name from an identity field (e.g. System.CreatedBy). */
function displayNameOf(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'displayName' in (value as object)) {
    return String((value as { displayName: unknown }).displayName ?? '');
  }
  return '';
}

/** Raw (un-normalized) client for an item, from the client field or project. */
function rawClientOf(item: WorkItem, clientField: string): string {
  if (clientField) {
    const value = item.fields[clientField];
    const str = typeof value === 'string' ? value.trim() : '';
    return str || 'Sin cliente';
  }
  return clientFromProject(String(item.fields['System.TeamProject'] ?? 'Sin proyecto'));
}

/**
 * "Tipo" of an item: the configured type field when present, otherwise the work
 * item type. The WorkItemType fallback also covers the case where the configured
 * field doesn't exist in the org (and was dropped by fetchDetails).
 */
function typeOf(item: WorkItem, typeField: string): string {
  if (typeField) {
    const value = item.fields[typeField];
    const str = typeof value === 'string' ? value.trim() : '';
    if (str) return str;
  }
  return String(item.fields['System.WorkItemType'] ?? 'Sin tipo');
}

/** Normalization key so "IKUSI", "Ikusi" and "ikusi" fold into one client. */
function clientKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** WIQL clause enforcing the source's created-date floor, or empty if unset. */
function minCreatedClause(source: AzureSourceConfig): string | null {
  const { minCreatedDate } = source.userStories;
  return minCreatedDate ? `[System.CreatedDate] >= '${escapeWiql(minCreatedDate)}'` : null;
}

function buildWiql(source: AzureSourceConfig): string {
  const { project, types } = source.userStories;
  const clauses: string[] = [];
  if (project) clauses.push(`[System.TeamProject] = '${escapeWiql(project)}'`);
  if (types.length > 0) {
    clauses.push(`[System.WorkItemType] IN (${types.map((t) => `'${escapeWiql(t)}'`).join(', ')})`);
  }
  clauses.push(openStateClause());
  const floor = minCreatedClause(source);
  if (floor) clauses.push(floor);
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

/** Extracts the field ref from an Azure "TF51535: Cannot find field X." error. */
function missingFieldFromError(err: unknown): string | null {
  const message = isAxiosError(err)
    ? ((err.response?.data as { message?: string } | undefined)?.message ?? err.message)
    : err instanceof Error
      ? err.message
      : '';
  const match = /cannot find field\s+([\w.]+)/i.exec(message);
  return match ? match[1].replace(/\.+$/, '') : null;
}

/**
 * Hydrates work items. If Azure rejects a requested field that doesn't exist in
 * the org (TF51535 — e.g. a misconfigured custom field), that field is dropped
 * and the fetch retried, so one bad field name degrades gracefully instead of
 * breaking the whole dashboard.
 */
async function fetchDetails(
  clients: AzureClients,
  source: AzureSourceConfig,
  ids: number[],
  fields: string[],
): Promise<WorkItem[]> {
  let activeFields = [...fields];
  for (;;) {
    try {
      const results: WorkItem[] = [];
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const { data } = await clients.core.post<{ value: WorkItem[] }>(
          `/_apis/wit/workitemsbatch`,
          { ids: ids.slice(i, i + BATCH_SIZE), fields: activeFields },
          { params: { 'api-version': source.apiVersion } },
        );
        results.push(...(data.value ?? []));
      }
      return results;
    } catch (err) {
      const missing = missingFieldFromError(err);
      if (missing && activeFields.includes(missing)) {
        activeFields = activeFields.filter((f) => f !== missing);
        // eslint-disable-next-line no-console
        console.warn(`[azure] Field "${missing}" not found in org; retrying without it.`);
        continue;
      }
      throw err;
    }
  }
}

/** True when the item's boolean urgency field is set. */
function isUrgent(item: WorkItem, urgentField: string): boolean {
  if (!urgentField) return false;
  const value = item.fields[urgentField];
  // Azure returns booleans as true JSON booleans, but tolerate string forms.
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'si', 'sí'].includes(value.trim().toLowerCase());
  return false;
}

/** Work item type listed in the "Bugs" table / counted in the KPI. */
const BUG_TYPE = 'Bug';

/** Maps a work item to a detail-listing row. `client` is already resolved. */
function toListItem(
  item: WorkItem,
  client: string,
  scheduledField: string,
  typeField: string,
  urgentField: string,
): StoryListItem {
  const f = item.fields;
  const scheduled = scheduledField ? f[scheduledField] : null;
  return {
    id: Number(f['System.Id']),
    client,
    title: String(f['System.Title'] ?? ''),
    type: typeOf(item, typeField),
    createdDate: (f['System.CreatedDate'] as string) ?? null,
    createdBy: displayNameOf(f['System.CreatedBy']),
    state: String(f['System.State'] ?? ''),
    urgent: isUrgent(item, urgentField),
    scheduledDate: typeof scheduled === 'string' && scheduled ? scheduled : null,
  };
}

/** Most-recent-first by creation date (list rows). */
function byCreatedDesc(a: StoryListItem, b: StoryListItem): number {
  return (b.createdDate ?? '').localeCompare(a.createdDate ?? '');
}

/** Most-recent-first by creation date field (raw work items). */
function itemByCreatedDesc(a: WorkItem, b: WorkItem): number {
  const av = (a.fields['System.CreatedDate'] as string) ?? '';
  const bv = (b.fields['System.CreatedDate'] as string) ?? '';
  return bv.localeCompare(av);
}

/**
 * Fetches open Bug-type work items (with details) in the source's project scope,
 * newest first. Returns raw work items so they can feed both the bugs listing
 * and the client×type breakdown.
 */
async function fetchBugItems(
  clients: AzureClients,
  source: AzureSourceConfig,
  filters: UserStoriesFilters = {},
): Promise<WorkItem[]> {
  const { project, clientField, typeField, scheduledField, urgentField } = source.userStories;
  const clauses = [`[System.WorkItemType] = '${escapeWiql(BUG_TYPE)}'`];
  if (project) clauses.unshift(`[System.TeamProject] = '${escapeWiql(project)}'`);
  clauses.push(openStateClause());
  const floor = minCreatedClause(source);
  if (floor) clauses.push(floor);
  // Respect the "Creadas desde" filter the user selected in the UI.
  if (filters.createdFrom) {
    clauses.push(`[System.CreatedDate] >= '${escapeWiql(filters.createdFrom)}'`);
  }
  const url = project
    ? `/${encodeURIComponent(project)}/_apis/wit/wiql`
    : `/_apis/wit/wiql`;
  const { data } = await clients.core.post<{ workItems: Array<{ id: number }> }>(
    url,
    { query: `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' AND ')}` },
    { params: { 'api-version': source.apiVersion } },
  );
  const ids = (data.workItems ?? []).map((w) => w.id);
  if (ids.length === 0) return [];

  const fields = [
    'System.Id',
    'System.Title',
    'System.State',
    'System.CreatedDate',
    'System.CreatedBy',
    'System.TeamProject',
    'System.WorkItemType',
  ];
  if (clientField) fields.push(clientField);
  if (typeField && !fields.includes(typeField)) fields.push(typeField);
  if (scheduledField && !fields.includes(scheduledField)) fields.push(scheduledField);
  if (urgentField && !fields.includes(urgentField)) fields.push(urgentField);
  const details = await fetchDetails(clients, source, ids, fields);
  return details.sort(itemByCreatedDesc);
}

function emptyReport(): UserStoriesReport {
  return {
    totalStories: 0,
    totalOpen: 0,
    totalResolved: 0,
    totalUrgent: 0,
    totalBugs: 0,
    byClient: [],
    finishedByMonth: [],
    openByMonthByClient: { months: [], series: [] },
    byClientByType: { clients: [], series: [] },
    openStories: [],
    bugs: [],
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

/** Element category: user stories, bugs, or both. */
export type Category = 'all' | 'us' | 'bugs';

/** Runtime filters applied before aggregation (lower bounds, inclusive). */
export interface UserStoriesFilters {
  /** Keep items created on/after this ISO date (yyyy-mm-dd). */
  createdFrom?: string;
  /** Keep items closed on/after this ISO date (yyyy-mm-dd). */
  closedFrom?: string;
  /** Which categories to include. Defaults to 'all'. */
  category?: Category;
}

/** Inclusive lower-bound compare of an ISO datetime against a yyyy-mm-dd bound. */
function onOrAfter(iso: string | undefined | null, bound: string): boolean {
  return typeof iso === 'string' && iso.slice(0, 10) >= bound;
}

/**
 * Builds the client × Tipo matrix. Clients are sorted by total volume (desc);
 * each series is one "Tipo" with counts aligned to the client axis.
 */
function buildClientTypeMatrix(
  items: WorkItem[],
  resolveClient: (item: WorkItem) => string,
  typeField: string,
): ClientTypeMatrix {
  const typeSet = new Set<string>();
  const perClient = new Map<string, Map<string, number>>();
  const clientTotals = new Map<string, number>();
  for (const item of items) {
    const client = resolveClient(item);
    const type = typeOf(item, typeField);
    typeSet.add(type);
    const m = perClient.get(client) ?? new Map<string, number>();
    m.set(type, (m.get(type) ?? 0) + 1);
    perClient.set(client, m);
    clientTotals.set(client, (clientTotals.get(client) ?? 0) + 1);
  }
  const clients = [...clientTotals.keys()].sort(
    (a, b) => (clientTotals.get(b) ?? 0) - (clientTotals.get(a) ?? 0),
  );
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));
  return {
    clients,
    series: types.map((type) => ({
      type,
      data: clients.map((c) => perClient.get(c)?.get(type) ?? 0),
    })),
  };
}

/**
 * "Requerimientos" report for a source, scoped to OPEN items only (state neither
 * Closed nor Resolved; Removed excluded) and to the selected `filters.category`
 * (User Stories, Bugs, or both). Every KPI, chart and table is computed over the
 * same category-filtered element set, so the category control drives the whole
 * report. `finishedByMonth` / `openByMonthByClient` stay empty under this scope.
 *
 * The client comes from `source.userStories.clientField` when set
 * (e.g. Custom.Cliente), otherwise from the project-name prefix.
 */
export async function getUserStoriesReport(
  clients: AzureClients,
  source: AzureSourceConfig,
  filters: UserStoriesFilters = {},
): Promise<UserStoriesReport> {
  const { clientField, urgentField, typeField, scheduledField } = source.userStories;
  const category = filters.category ?? 'all';
  const includeUS = category !== 'bugs';
  const includeBugs = category !== 'us';

  const usFields = [...BASE_FIELDS];
  if (clientField) usFields.push(clientField);
  if (urgentField && !usFields.includes(urgentField)) usFields.push(urgentField);
  if (typeField && !usFields.includes(typeField)) usFields.push(typeField);
  if (scheduledField && !usFields.includes(scheduledField)) usFields.push(scheduledField);

  const [usIds, bugItems] = await Promise.all([
    includeUS ? fetchBacklogIds(clients, source) : Promise.resolve<number[]>([]),
    includeBugs ? fetchBugItems(clients, source, filters) : Promise.resolve<WorkItem[]>([]),
  ]);

  let usItems: WorkItem[] = [];
  if (usIds.length > 0) {
    const all = await fetchDetails(clients, source, usIds, usFields);
    usItems = all.filter((item) => {
      const f = item.fields;
      // Open-only scope (belt-and-suspenders in case WIQL casing differs).
      if (!isOpenState(String(f['System.State'] ?? ''))) return false;
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
  }

  const elements = [...usItems, ...bugItems];
  const totalBugs = bugItems.length;
  if (elements.length === 0) return { ...emptyReport(), totalBugs };

  // Canonical client display names over the whole element set.
  const variants = new Map<string, Map<string, number>>();
  for (const item of elements) {
    const raw = rawClientOf(item, clientField);
    const key = clientKey(raw);
    const counts = variants.get(key) ?? new Map<string, number>();
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    variants.set(key, counts);
  }
  const displayNames = resolveDisplayNames(variants);
  const resolveClient = (item: WorkItem): string =>
    displayNames.get(clientKey(rawClientOf(item, clientField))) ?? rawClientOf(item, clientField);

  const toRow = (item: WorkItem): StoryListItem =>
    toListItem(item, resolveClient(item), scheduledField, typeField, urgentField);
  const openStories = usItems.map(toRow).sort(byCreatedDesc);
  const bugs = bugItems.map(toRow).sort(byCreatedDesc);

  // Aggregates over the (open-only) element set.
  let totalUrgent = 0;
  const byClientMap = new Map<string, ClientStoryCount>();
  for (const item of elements) {
    if (isUrgent(item, urgentField)) totalUrgent += 1;
    const client = resolveClient(item);
    const bucket = byClientMap.get(client) ?? { client, open: 0, resolved: 0, total: 0 };
    bucket.open += 1;
    bucket.total += 1;
    byClientMap.set(client, bucket);
  }
  const byClient = [...byClientMap.values()].sort((a, b) => b.total - a.total);
  const byClientByType = buildClientTypeMatrix(elements, resolveClient, typeField);

  return {
    totalStories: openStories.length,
    totalOpen: elements.length,
    totalResolved: 0,
    totalUrgent,
    totalBugs,
    byClient,
    finishedByMonth: [],
    openByMonthByClient: { months: [], series: [] },
    byClientByType,
    openStories,
    bugs,
  };
}
