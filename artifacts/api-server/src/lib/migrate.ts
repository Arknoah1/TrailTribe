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
  {
    name: "add_volunteer_tasks_enabled_column",
    sql: `
      ALTER TABLE events
        ADD COLUMN IF NOT EXISTS volunteer_tasks_enabled boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: "create_volunteer_template_tasks_table",
    sql: `
      CREATE TABLE IF NOT EXISTS volunteer_template_tasks (
        id serial PRIMARY KEY,
        category text NOT NULL,
        title text NOT NULL,
        description text,
        slots_default integer NOT NULL DEFAULT 1,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "create_event_tasks_table",
    sql: `
      CREATE TABLE IF NOT EXISTS event_tasks (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        template_task_id integer REFERENCES volunteer_template_tasks(id) ON DELETE SET NULL,
        category text NOT NULL,
        title text NOT NULL,
        description text,
        slots_needed integer NOT NULL DEFAULT 1,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "create_event_task_signups_table",
    sql: `
      CREATE TABLE IF NOT EXISTS event_task_signups (
        id serial PRIMARY KEY,
        event_task_id integer NOT NULL REFERENCES event_tasks(id) ON DELETE CASCADE,
        event_id integer REFERENCES events(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS event_task_signups_task_user_unique
        ON event_task_signups(event_task_id, user_id);
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
