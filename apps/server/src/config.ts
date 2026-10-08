import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

loadEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy apps/server/.env.example to apps/server/.env and fill it in.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Configuration for the "user stories by client" report of a source. */
export interface UserStoriesConfig {
  /** Scope to a single project; empty = all projects in the org. */
  project: string;
  /**
   * Work item field ref used as "Cliente" (e.g. "Custom.Cliente"). When empty,
   * the client is derived from the project name prefix ("Client - Project").
   */
  clientField: string;
  /** Backlog work item types to include. */
  types: string[];
  /**
   * Boolean work item field ref that flags urgency (e.g. "Custom.Urgente"). A US
   * is urgent when this field is true. Empty disables the "urgent" metric.
   */
  urgentField: string;
  /**
   * Hard floor on System.CreatedDate applied at the source (WIQL). Items created
   * before this ISO date (yyyy-mm-dd) are never fetched. Empty = no floor.
   */
  minCreatedDate: string;
  /**
   * Field ref used as "Tipo" to break a client's items into stacked series
   * (e.g. "Custom.Type"). Empty = fall back to System.WorkItemType.
   */
  typeField: string;
  /**
   * Date field ref for the scheduled delivery date, used to drive the traffic
   * light indicator (e.g. "Custom.Fechadeentregaprogramada"). Empty disables it.
   */
  scheduledField: string;
}

/** A single Azure DevOps organization the app can query. */
export interface AzureSourceConfig {
  /** Stable id used in API routes, e.g. "devprojects" or "keytia". */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  org: string;
  pat: string;
  apiVersion: string;
  baseUrl: string;
  analyticsUrl: string;
  /** Optional default project used to preselect a filter in the UI. */
  defaultProject: string;
  /** How the "user stories by client" report is scoped for this source. */
  userStories: UserStoriesConfig;
  /**
   * Project names excluded from every report (project selector, Overview, Work
   * Items and Velocity). Matched case- and trim-insensitively by name.
   */
  excludedProjects: string[];
}

const DEFAULT_BACKLOG_TYPES = ['User Story', 'Product Backlog Item', 'Issue', 'Requirement'];

function parseList(value: string, fallback: string[]): string[] {
  const parsed = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  /** Azure DevOps organizations keyed by source id. */
  sources: Record<string, AzureSourceConfig>;
  /** Source used by the team dashboards (Resumen / Work Items / Velocity). */
  primarySourceId: string;
}

/** Convention Azure DevOps uses for a project's default team. */
export function defaultTeamFor(project: string): string {
  return `${project} Team`;
}

/** Normaliza un nombre de proyecto para comparar sin distinción de mayúsculas ni espacios. */
function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Lee la lista de proyectos excluidos desde `excluded-projects.json` (en la raíz
 * de apps/server). Si el archivo no existe o es inválido, no se excluye ninguno
 * (nunca rompe el arranque).
 */
function loadExcludedProjects(): string[] {
  const path = fileURLToPath(new URL('../excluded-projects.json', import.meta.url));
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { projects?: unknown };
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    return list.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    console.warn(`No se pudo leer excluded-projects.json: ${(err as Error).message}`);
    return [];
  }
}

/** True si el proyecto está en la lista de exclusión de la fuente. */
export function isProjectExcluded(source: AzureSourceConfig, projectName: string): boolean {
  if (source.excludedProjects.length === 0) return false;
  const target = normalizeProjectName(projectName);
  return source.excludedProjects.some((p) => normalizeProjectName(p) === target);
}

function buildSource(params: {
  id: string;
  label: string;
  org: string;
  pat: string;
  apiVersion: string;
  defaultProject?: string;
  userStories?: Partial<UserStoriesConfig>;
  excludedProjects?: string[];
}): AzureSourceConfig {
  return {
    id: params.id,
    label: params.label,
    org: params.org,
    pat: params.pat,
    apiVersion: params.apiVersion,
    defaultProject: params.defaultProject ?? '',
    excludedProjects: params.excludedProjects ?? [],
    baseUrl: `https://dev.azure.com/${encodeURIComponent(params.org)}`,
    analyticsUrl: `https://analytics.dev.azure.com/${encodeURIComponent(params.org)}`,
    userStories: {
      project: params.userStories?.project ?? '',
      clientField: params.userStories?.clientField ?? '',
      types: params.userStories?.types ?? DEFAULT_BACKLOG_TYPES,
      urgentField: params.userStories?.urgentField ?? '',
      minCreatedDate: params.userStories?.minCreatedDate ?? '',
      typeField: params.userStories?.typeField ?? '',
      scheduledField: params.userStories?.scheduledField ?? '',
    },
  };
}

/**
 * Reads and validates configuration once at startup. Supports multiple
 * independent Azure DevOps organizations ("sources"):
 *   - devprojects (primary): the team's projects — AZDO_ORG / AZDO_PAT
 *   - keytia (optional): the Keytia ticketing org — KEYTIA_ORG / KEYTIA_PAT
 * Only the primary org and its PAT are required; keytia is enabled when its
 * variables are present.
 */
export function loadConfig(): AppConfig {
  const apiVersion = optional('AZDO_API_VERSION', '7.1');
  const excludedProjects = loadExcludedProjects();
  const sources: Record<string, AzureSourceConfig> = {};

  // Primary source: the team's projects.
  sources.devprojects = buildSource({
    id: 'devprojects',
    label: optional('AZDO_LABEL', 'Proyectos del equipo'),
    org: required('AZDO_ORG'),
    pat: required('AZDO_PAT'),
    apiVersion,
    defaultProject: optional('AZDO_PROJECT', ''),
    excludedProjects,
  });

  // Optional source: the Keytia ticketing organization. Scoped to a single
  // project and grouped by the Custom.Cliente field.
  const keytiaOrg = optional('KEYTIA_ORG', '');
  const keytiaPat = optional('KEYTIA_PAT', '');
  if (keytiaOrg && keytiaPat) {
    const keytiaProject = optional('KEYTIA_PROJECT', 'KeytiaDev Backlog');
    sources.keytia = buildSource({
      id: 'keytia',
      label: optional('KEYTIA_LABEL', 'Keytia (tickets)'),
      org: keytiaOrg,
      pat: keytiaPat,
      apiVersion: optional('KEYTIA_API_VERSION', apiVersion),
      defaultProject: keytiaProject,
      userStories: {
        project: keytiaProject,
        clientField: optional('KEYTIA_CLIENT_FIELD', 'Custom.Cliente'),
        types: parseList(optional('KEYTIA_STORY_TYPES', 'User Story'), ['User Story']),
        urgentField: optional('KEYTIA_URGENT_FIELD', 'Custom.Urgente'),
        minCreatedDate: optional('KEYTIA_MIN_CREATED_DATE', ''),
        typeField: optional('KEYTIA_TYPE_FIELD', 'Custom.Tipo'),
        scheduledField: optional('KEYTIA_SCHEDULED_FIELD', 'Custom.Fechadeentregaprogramada'),
      },
    });
  }

  return {
    port: Number(optional('PORT', '4000')),
    corsOrigins: optional('CORS_ORIGIN', 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    sources,
    primarySourceId: 'devprojects',
  };
}
