import app from "./app";
import { logger } from "./lib/logger";
import { startEmailReminderJob } from "./lib/emailReminders";
import { startVolunteerReminderJob } from "./lib/volunteerReminders";
import { runMigrations } from "./lib/migrate";

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
      startEmailReminderJob();
      startVolunteerReminderJob();
    });
  })
  .catch((err) => {
    logger.error({ err }, "[migrate] startup migration failed — aborting");
    process.exit(1);
  });
