import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { beginPlaywrightDrain, waitForPlaywrightIdle } from "./lib/playwright-budget";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
server.on("error", (error) => {
  logger.error({ error }, "Error listening on port");
  process.exitCode = 1;
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  beginPlaywrightDrain();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  const idle = await waitForPlaywrightIdle(6 * 60_000);
  if (!idle) logger.error("Playwright budget did not drain before the shutdown deadline");
  await closed;
  await pool.end().catch((error) => logger.warn({ error }, "Database pool shutdown failed"));
  logger.info({ signal, idle }, "Graceful shutdown completed");
  process.exit(idle ? 0 : 1);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
