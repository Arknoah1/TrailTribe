import app from "./app";
import { logger } from "./lib/logger";
import { startEmailReminderJob } from "./lib/emailReminders";
import { startVolunteerReminderJob } from "./lib/volunteerReminders";
import { runMigrations } from "./lib/migrate";
import { getAppBase } from "./lib/config";
import { stopEmailHealthCheck } from "./lib/email";

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

runMigrations()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");

      const inviteBaseUrl = getAppBase();
      if (inviteBaseUrl) {
        logger.info({ inviteBaseUrl }, "[config] Invite link base URL resolved");
      } else {
        logger.warn(
          "[config] Invite base URL is empty — set APP_BASE_URL or REPLIT_DEV_DOMAIN so invite links work correctly",
        );
      }

      startEmailReminderJob();
      startVolunteerReminderJob();
    });
  })
  .catch((err) => {
    logger.error({ err }, "[migrate] startup migration failed — aborting");
    process.exit(1);
  });

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal — cleaning up");
  stopEmailHealthCheck();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
