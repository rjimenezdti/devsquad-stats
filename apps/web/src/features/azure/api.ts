import { apiClient } from '@/lib/apiClient';
import type {
  Iteration,
  Meta,
  Project,
  SourceInfo,
  UserStoriesReport,
  VelocityOverview,
  VelocityReport,
  WorkItemsReport,
} from '@/types/azure';

/** Azure DevOps source (organization) ids exposed by the backend. */
export const SOURCE = {
  devprojects: 'devprojects',
  keytia: 'keytia',
} as const;

export type SourceId = (typeof SOURCE)[keyof typeof SOURCE];

export interface WorkItemsParams {
  /** Empty string = all projects in the organization. */
  project?: string;
  iterationPath?: string;
  types?: string[];
}

export async function fetchSources(): Promise<SourceInfo[]> {
  const { data } = await apiClient.get<SourceInfo[]>('/sources');
  return data;
}

export async function fetchMeta(source: SourceId): Promise<Meta> {
  const { data } = await apiClient.get<Meta>(`/${source}/meta`);
  return data;
}

export async function fetchProjects(source: SourceId): Promise<Project[]> {
  const { data } = await apiClient.get<Project[]>(`/${source}/projects`);
  return data;
}

export async function fetchWorkItems(
  source: SourceId,
  params: WorkItemsParams = {},
): Promise<WorkItemsReport> {
  const { data } = await apiClient.get<WorkItemsReport>(`/${source}/work-items`, {
    params: {
      project: params.project || undefined,
      iterationPath: params.iterationPath,
      types: params.types?.length ? params.types.join(',') : undefined,
    },
  });
  return data;
}

export async function fetchIterations(
  source: SourceId,
  project: string,
  team?: string,
): Promise<Iteration[]> {
  const { data } = await apiClient.get<Iteration[]>(`/${source}/iterations`, {
    params: { project: project || undefined, team },
  });
  return data;
}

export async function fetchVelocity(
  source: SourceId,
  project: string,
  count?: number,
): Promise<VelocityReport> {
  const { data } = await apiClient.get<VelocityReport>(`/${source}/velocity`, {
    params: { project: project || undefined, count },
  });
  return data;
}

export async function fetchVelocityOverview(
  source: SourceId,
  count?: number,
): Promise<VelocityOverview> {
  const { data } = await apiClient.get<VelocityOverview>(`/${source}/velocity-overview`, {
    params: { count },
  });
  return data;
}

export interface UserStoriesFilters {
  /** Keep items created on/after this ISO date (yyyy-mm-dd). */
  createdFrom?: string;
  /** Keep items closed on/after this ISO date (yyyy-mm-dd). */
  closedFrom?: string;
}

export async function fetchUserStories(
  source: SourceId,
  filters: UserStoriesFilters = {},
): Promise<UserStoriesReport> {
  const { data } = await apiClient.get<UserStoriesReport>(`/${source}/user-stories`, {
    params: {
      createdFrom: filters.createdFrom || undefined,
      closedFrom: filters.closedFrom || undefined,
    },
  });
  return data;
}
