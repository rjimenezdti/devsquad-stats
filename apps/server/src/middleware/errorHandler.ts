import { isAxiosError } from 'axios';
import type { NextFunction, Request, Response } from 'express';

/**
 * Central error handler. Azure DevOps failures come back as axios errors; we
 * surface a clean status + message to the frontend without leaking the PAT or
 * internal stack traces.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required 4-arg signature
  _next: NextFunction,
): void {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 502;
    const azureMessage =
      (err.response?.data as { message?: string } | undefined)?.message ?? err.message;

    // eslint-disable-next-line no-console
    console.error(`[azure] ${status} ${err.config?.url ?? ''} -> ${azureMessage}`);

    res.status(status === 401 || status === 403 ? status : 502).json({
      error: 'AzureDevOpsError',
      status,
      message:
        status === 401 || status === 403
          ? 'Azure DevOps rejected the credentials. Check AZDO_PAT and its scopes.'
          : azureMessage,
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[server]', err);
  res.status(500).json({
    error: 'InternalServerError',
    message: err instanceof Error ? err.message : 'Unexpected error',
  });
}
