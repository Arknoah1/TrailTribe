import { pool } from "@workspace/db";
import { logger } from "./logger";

const migrations: { name: string; sql: string }[] = [
  {
    name: "add_broadcasts_delivery_counts",
    sql: `
      ALTER TABLE broadcasts
        ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const migration of migrations) {
      logger.info({ migration: migration.name }, "[migrate] running");
      await client.query(migration.sql);
      logger.info({ migration: migration.name }, "[migrate] done");
    }
  } catch (err) {
    logger.error({ err }, "[migrate] migration failed");
    throw err;
  } finally {
    client.release();
  }
}
