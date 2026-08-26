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

function buildSource(params: {
  id: string;
  label: string;
  org: string;
  pat: string;
  apiVersion: string;
  defaultProject?: string;
  userStories?: Partial<UserStoriesConfig>;
}): AzureSourceConfig {
  return {
    id: params.id,
    label: params.label,
    org: params.org,
    pat: params.pat,
    apiVersion: params.apiVersion,
    defaultProject: params.defaultProject ?? '',
    baseUrl: `https://dev.azure.com/${encodeURIComponent(params.org)}`,
    analyticsUrl: `https://analytics.dev.azure.com/${encodeURIComponent(params.org)}`,
    userStories: {
      project: params.userStories?.project ?? '',
      clientField: params.userStories?.clientField ?? '',
      types: params.userStories?.types ?? DEFAULT_BACKLOG_TYPES,
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
  const sources: Record<string, AzureSourceConfig> = {};

  // Primary source: the team's projects.
  sources.devprojects = buildSource({
    id: 'devprojects',
    label: optional('AZDO_LABEL', 'Proyectos del equipo'),
    org: required('AZDO_ORG'),
    pat: required('AZDO_PAT'),
    apiVersion,
    defaultProject: optional('AZDO_PROJECT', ''),
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
