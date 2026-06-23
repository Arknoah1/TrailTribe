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
  {
    name: "drop_volunteer_signups_table",
    sql: `DROP TABLE IF EXISTS volunteer_signups;`,
  },
  {
    name: "seed_volunteer_template_tasks",
    sql: `
      INSERT INTO volunteer_template_tasks (category, title, slots_default, sort_order)
      SELECT category, title, slots_default, sort_order FROM (VALUES
        ('Race Day',                          'Head Coach',              1, 10),
        ('Race Day',                          'Mechanic',                1, 20),
        ('Race Day',                          'Warm Ups',                2, 30),
        ('Race Day',                          'First Aid',               1, 40),
        ('Bike Village – Before Race Weekend','Food Shopping + Prep',    1, 10),
        ('Bike Village – Before Race Weekend','Transport Team Items',    1, 20),
        ('Bike Village – Before Race Weekend','Village Set Up',          2, 30),
        ('Bike Village – Before Race Weekend','Transport Grill',         1, 40),
        ('Bike Village – Saturday',           'Grill Chief',             2, 10),
        ('Bike Village – Saturday',           'Food Prep',               2, 20),
        ('Bike Village – Saturday',           'Water',                   1, 30),
        ('Bike Village – Saturday',           'Village Breakdown',       3, 40),
        ('Bike Village – Saturday',           'Garbage & Recycle',       1, 50),
        ('Bike Village – Saturday',           'Lost and Found',          1, 60),
        ('Bike Village – Sunday',             'Grill Chief',             2, 10),
        ('Bike Village – Sunday',             'Food Prep',               2, 20),
        ('Bike Village – Sunday',             'Water',                   1, 30),
        ('Bike Village – Sunday',             'Village Breakdown',       3, 40),
        ('Bike Village – Sunday',             'Garbage & Recycle',       1, 50),
        ('Bike Village – Sunday',             'Lost and Found',          1, 60),
        ('Bike Village – Sunday',             'Photographer (Optional)', 1, 70)
      ) AS t(category, title, slots_default, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM volunteer_template_tasks LIMIT 1);
    `,
  },
  {
    name: "create_volunteer_task_packs_table",
    sql: `
      CREATE TABLE IF NOT EXISTS volunteer_task_packs (
        id serial PRIMARY KEY,
        name text NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "create_volunteer_task_pack_tasks_table",
    sql: `
      CREATE TABLE IF NOT EXISTS volunteer_task_pack_tasks (
        id serial PRIMARY KEY,
        pack_id integer NOT NULL REFERENCES volunteer_task_packs(id) ON DELETE CASCADE,
        template_task_id integer NOT NULL REFERENCES volunteer_template_tasks(id) ON DELETE CASCADE,
        UNIQUE(pack_id, template_task_id)
      );
    `,
  },
  {
    name: "seed_race_weekend_pack",
    sql: `
      DO $$
      DECLARE
        new_pack_id integer;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM volunteer_task_packs WHERE name = 'Race Weekend') THEN
          INSERT INTO volunteer_task_packs (name, description)
          VALUES ('Race Weekend', 'Full race weekend coverage — Race Day roles and Bike Village setup across all days')
          RETURNING id INTO new_pack_id;
          INSERT INTO volunteer_task_pack_tasks (pack_id, template_task_id)
          SELECT new_pack_id, id FROM volunteer_template_tasks;
        END IF;
      END $$;
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
