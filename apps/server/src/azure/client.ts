import axios, { type AxiosInstance } from 'axios';
import type { AzureSourceConfig } from '../config.js';

/**
 * Azure DevOps authenticates REST calls with HTTP Basic auth where the
 * username is empty and the password is the PAT. We build the header once and
 * reuse a single axios instance per source (organization).
 */
function authHeader(pat: string): string {
  const token = Buffer.from(`:${pat}`).toString('base64');
  return `Basic ${token}`;
}

export interface AzureClients {
  /** dev.azure.com/{org} — core REST APIs (work, wit, git, build...). */
  core: AxiosInstance;
  /** analytics.dev.azure.com/{org} — OData Analytics endpoint. */
  analytics: AxiosInstance;
}

export function createAzureClients(source: AzureSourceConfig): AzureClients {
  const headers = {
    Authorization: authHeader(source.pat),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return {
    core: axios.create({ baseURL: source.baseUrl, headers, timeout: 30_000 }),
    analytics: axios.create({ baseURL: source.analyticsUrl, headers, timeout: 30_000 }),
  };
}
