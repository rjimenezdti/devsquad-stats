import axios from 'axios';

/**
 * Axios instance pointed at the backend proxy. The PAT lives on the server, so
 * the browser only ever talks to our own /api endpoints.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 40_000,
});

export interface ApiErrorShape {
  error: string;
  status?: number;
  message: string;
}

export function toErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorShape | undefined;
    return data?.message ?? err.message;
  }
  return err instanceof Error ? err.message : 'Error inesperado';
}
