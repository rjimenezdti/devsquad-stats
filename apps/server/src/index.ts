import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { loadConfig } from './config.js';
import { createAzureClients } from './azure/client.js';
import { createApiRouter, type SourceRegistry } from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';

function bootstrap(): void {
  const config = loadConfig();

  // Build one set of axios clients per configured source (organization).
  const registry: SourceRegistry = {};
  for (const source of Object.values(config.sources)) {
    registry[source.id] = { clients: createAzureClients(source), source };
  }

  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : true }));
  app.use(compression());
  app.use(express.json());

  app.use('/api', createApiRouter(registry, config));

  app.use(errorHandler);

  app.listen(config.port, () => {
    const sources = Object.values(config.sources)
      .map((s) => `${s.id}="${s.org}"`)
      .join(', ');
    // eslint-disable-next-line no-console
    console.log(
      `[server] devsquad-stats proxy listening on http://localhost:${config.port}\n` +
        `[server] Azure DevOps sources: ${sources}`,
    );
  });
}

try {
  bootstrap();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[server] Failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
}
