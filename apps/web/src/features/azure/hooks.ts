import { useQuery } from '@tanstack/react-query';
import {
  fetchIterations,
  fetchMeta,
  fetchProjects,
  fetchSources,
  fetchUserStories,
  fetchVelocity,
  fetchVelocityOverview,
  fetchWorkItems,
  type SourceId,
  type UserStoriesFilters,
  type WorkItemsParams,
} from './api';

export const azureKeys = {
  sources: ['sources'] as const,
  meta: (source: SourceId) => ['meta', source] as const,
  projects: (source: SourceId) => ['projects', source] as const,
  workItems: (source: SourceId, params: WorkItemsParams) =>
    ['work-items', source, params] as const,
  iterations: (source: SourceId, project: string) => ['iterations', source, project] as const,
  velocity: (source: SourceId, project: string, count?: number) =>
    ['velocity', source, project, count ?? 6] as const,
  velocityOverview: (source: SourceId, count?: number) =>
    ['velocity-overview', source, count ?? 3] as const,
  userStories: (source: SourceId, filters: UserStoriesFilters) =>
    ['user-stories', source, filters] as const,
};

export function useSources() {
  return useQuery({ queryKey: azureKeys.sources, queryFn: fetchSources, staleTime: Infinity });
}

export function useMeta(source: SourceId) {
  return useQuery({
    queryKey: azureKeys.meta(source),
    queryFn: () => fetchMeta(source),
    staleTime: Infinity,
  });
}

export function useProjects(source: SourceId) {
  return useQuery({
    queryKey: azureKeys.projects(source),
    queryFn: () => fetchProjects(source),
    staleTime: Infinity,
  });
}

export function useWorkItems(source: SourceId, params: WorkItemsParams = {}) {
  return useQuery({
    queryKey: azureKeys.workItems(source, params),
    queryFn: () => fetchWorkItems(source, params),
  });
}

export function useIterations(source: SourceId, project: string) {
  return useQuery({
    queryKey: azureKeys.iterations(source, project),
    queryFn: () => fetchIterations(source, project),
    enabled: Boolean(project),
  });
}

/** Sprint-by-sprint velocity; only runs when a specific project is selected. */
export function useVelocity(source: SourceId, project: string, count?: number) {
  return useQuery({
    queryKey: azureKeys.velocity(source, project, count),
    queryFn: () => fetchVelocity(source, project, count),
    enabled: Boolean(project),
  });
}

/** Org-wide velocity comparison; only runs when no project is selected. */
export function useVelocityOverview(source: SourceId, count?: number, enabled = true) {
  return useQuery({
    queryKey: azureKeys.velocityOverview(source, count),
    queryFn: () => fetchVelocityOverview(source, count),
    enabled,
  });
}

/** User-stories-by-client report, optionally filtered by created/closed date. */
export function useUserStories(source: SourceId, filters: UserStoriesFilters = {}) {
  return useQuery({
    queryKey: azureKeys.userStories(source, filters),
    queryFn: () => fetchUserStories(source, filters),
    placeholderData: (prev) => prev,
  });
}
