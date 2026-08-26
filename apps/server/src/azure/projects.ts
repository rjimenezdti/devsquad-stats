import type { AzureSourceConfig } from '../config.js';
import type { AzureClients } from './client.js';
import type { Project } from '../types/azure.js';

interface RawProject {
  id: string;
  name: string;
  description?: string;
  state: string;
  lastUpdateTime?: string;
}

/** Lists every project in the organization the PAT can see. */
export async function getProjects(
  clients: AzureClients,
  source: AzureSourceConfig,
): Promise<Project[]> {
  const { data } = await clients.core.get<{ value: RawProject[] }>(`/_apis/projects`, {
    params: { 'api-version': source.apiVersion, $top: 500, stateFilter: 'wellFormed' },
  });

  return (data.value ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      state: p.state,
      lastUpdateTime: p.lastUpdateTime ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
