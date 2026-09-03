import { pool } from "@workspace/db";
import { logger } from "./logger";

const migrations: { name: string; sql: string }[] = [
  {
    name: "create_push_devices_table",
    sql: `
      CREATE TABLE IF NOT EXISTS push_devices (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        platform text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS push_devices_user_id_idx ON push_devices(user_id);
    `,
  },
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
        category text,
        category_id integer,
        title text NOT NULL,
        description text,
        slots_default integer NOT NULL DEFAULT 1,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "create_volunteer_template_categories_and_backfill",
    sql: `
      CREATE TABLE IF NOT EXISTS volunteer_template_categories (
        id serial PRIMARY KEY,
        name text NOT NULL,
        name_key text NOT NULL UNIQUE,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS volunteer_template_categories_sort_order_idx
        ON volunteer_template_categories(sort_order);

      ALTER TABLE volunteer_template_tasks
        ADD COLUMN IF NOT EXISTS category_id integer;

      DO $$
      BEGIN
        -- The legacy category column exists only until this backfill has run.
        -- Keeping the conversion guarded makes this migration safe on every
        -- subsequent startup, since this project reruns idempotent migrations.
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'volunteer_template_tasks'
            AND column_name = 'category'
        ) THEN
          INSERT INTO volunteer_template_categories (name, name_key, sort_order)
          SELECT
            MIN(display_name),
            name_key,
            ROW_NUMBER() OVER (ORDER BY MIN(first_sort_order), name_key)::integer * 10
          FROM (
            SELECT
              CASE
                WHEN btrim(category) = '' THEN 'Uncategorized'
                ELSE regexp_replace(btrim(category), '\\s+', ' ', 'g')
              END AS display_name,
              lower(
                CASE
                  WHEN btrim(category) = '' THEN 'Uncategorized'
                  ELSE regexp_replace(btrim(category), '\\s+', ' ', 'g')
                END
              ) AS name_key,
              sort_order AS first_sort_order
            FROM volunteer_template_tasks
            WHERE category IS NOT NULL
          ) AS legacy_categories
          GROUP BY name_key
          ON CONFLICT (name_key) DO NOTHING;

          UPDATE volunteer_template_tasks AS task
          SET category_id = category.id
          FROM volunteer_template_categories AS category
          WHERE task.category_id IS NULL
            AND category.name_key = lower(
              CASE
                WHEN btrim(task.category) = '' THEN 'Uncategorized'
                ELSE regexp_replace(btrim(task.category), '\\s+', ' ', 'g')
              END
            );

          WITH ranked_tasks AS (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY category_id
                ORDER BY sort_order, id
              )::integer * 10 AS new_sort_order
            FROM volunteer_template_tasks
          )
          UPDATE volunteer_template_tasks AS task
          SET sort_order = ranked_tasks.new_sort_order
          FROM ranked_tasks
          WHERE task.id = ranked_tasks.id;

          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'volunteer_template_tasks_category_id_fk'
          ) THEN
            ALTER TABLE volunteer_template_tasks
              ADD CONSTRAINT volunteer_template_tasks_category_id_fk
              FOREIGN KEY (category_id)
              REFERENCES volunteer_template_categories(id)
              ON DELETE RESTRICT;
          END IF;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS volunteer_template_tasks_category_sort_idx
        ON volunteer_template_tasks(category_id, sort_order);
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
      INSERT INTO volunteer_template_categories (name, name_key, sort_order)
      SELECT seed.name, lower(seed.name), seed.sort_order
      FROM (VALUES
        ('Race Day',                           10),
        ('Bike Village – Before Race Weekend', 20),
        ('Bike Village – Saturday',            30),
        ('Bike Village – Sunday',              40)
      ) AS seed(name, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM volunteer_template_tasks LIMIT 1)
      ON CONFLICT (name_key) DO NOTHING;

      INSERT INTO volunteer_template_tasks (category_id, title, slots_default, sort_order)
      SELECT categories.id, seed.title, seed.slots_default, seed.sort_order
      FROM (VALUES
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
      ) AS seed(category, title, slots_default, sort_order)
      INNER JOIN volunteer_template_categories AS categories
        ON categories.name_key = lower(seed.category)
      WHERE NOT EXISTS (SELECT 1 FROM volunteer_template_tasks LIMIT 1);
    `,
  },
  {
    name: "finalize_volunteer_template_task_categories",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM volunteer_template_tasks
          WHERE category_id IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot finalize volunteer template categories: category_id backfill is incomplete';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'volunteer_template_tasks_category_id_fk'
        ) THEN
          ALTER TABLE volunteer_template_tasks
            ADD CONSTRAINT volunteer_template_tasks_category_id_fk
            FOREIGN KEY (category_id)
            REFERENCES volunteer_template_categories(id)
            ON DELETE RESTRICT;
        END IF;

        ALTER TABLE volunteer_template_tasks
          ALTER COLUMN category_id SET NOT NULL;
        ALTER TABLE volunteer_template_tasks
          DROP COLUMN IF EXISTS category;
      END $$;

      CREATE INDEX IF NOT EXISTS volunteer_template_tasks_category_sort_idx
        ON volunteer_template_tasks(category_id, sort_order);
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
    name: "create_board_threads_table",
    sql: `
      CREATE TABLE IF NOT EXISTS board_threads (
        id serial PRIMARY KEY,
        title text NOT NULL,
        body text NOT NULL,
        author_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        pod_id text,
        event_id integer REFERENCES events(id) ON DELETE CASCADE,
        is_pinned boolean NOT NULL DEFAULT false,
        is_locked boolean NOT NULL DEFAULT false,
        reply_count integer NOT NULL DEFAULT 0,
        last_reply_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "create_board_posts_table",
    sql: `
      CREATE TABLE IF NOT EXISTS board_posts (
        id serial PRIMARY KEY,
        thread_id integer NOT NULL REFERENCES board_threads(id) ON DELETE CASCADE,
        author_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        body text NOT NULL,
        is_deleted boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "add_board_last_seen_at_to_users",
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS board_last_seen_at timestamptz;
    `,
  },
  {
    name: "add_board_replies_to_notification_prefs",
    sql: `
      UPDATE users
      SET notification_preferences = notification_preferences || '{"boardReplies": true}'
      WHERE notification_preferences IS NOT NULL
        AND NOT (notification_preferences ? 'boardReplies');
    `,
  },
  {
    name: "create_object_acl_policies_table",
    sql: `
      CREATE TABLE IF NOT EXISTS object_acl_policies (
        object_path text PRIMARY KEY,
        policy      jsonb NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
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
  {
    name: "create_seasons_table",
    sql: `
      CREATE TABLE IF NOT EXISTS seasons (
        id serial PRIMARY KEY,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        start_date timestamptz NOT NULL DEFAULT now(),
        end_date timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "add_season_enrolled_to_households",
    sql: `
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS season_enrolled boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: "clear_seed_data",
    // Permanently disabled — the invite-code guard accidentally matched a real
    // production household (invite_code '36054529c4fe') and wiped real data on
    // every server restart. All seed cleanup has already occurred; this is now
    // a permanent no-op so the migration slot stays in place.
    sql: `SELECT 1;`,
  },
  {
    name: "create_season_roster_snapshots_table",
    sql: `
      CREATE TABLE IF NOT EXISTS season_roster_snapshots (
        id serial PRIMARY KEY,
        season_id integer NOT NULL REFERENCES seasons(id),
        household_id integer NOT NULL,
        family_name text NOT NULL,
        pod_name text,
        enrolled boolean NOT NULL DEFAULT false,
        liability_waiver_signed boolean NOT NULL DEFAULT false,
        media_release_signed boolean NOT NULL DEFAULT false,
        code_of_conduct_signed boolean NOT NULL DEFAULT false,
        emergency_contact_name text,
        emergency_contact_phone text,
        members jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    // Idempotent bootstrap: the document_type enum was originally created by
    // drizzle-kit push and is required by team_documents (and later document_consents).
    name: "create_document_type_enum",
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
          CREATE TYPE document_type AS ENUM ('liability_waiver', 'media_release', 'code_of_conduct');
        END IF;
      END $$;
    `,
  },
  {
    // Idempotent bootstrap: team_documents was originally created by drizzle-kit push.
    // Creating it here ensures a fresh database can run all subsequent migrations.
    name: "create_team_documents_table",
    sql: `
      CREATE TABLE IF NOT EXISTS team_documents (
        id serial PRIMARY KEY,
        type document_type NOT NULL UNIQUE,
        label text NOT NULL,
        description text,
        object_path text,
        external_url text,
        mime_type text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "add_original_name_to_team_documents",
    sql: `
      ALTER TABLE team_documents
        ADD COLUMN IF NOT EXISTS original_name text;
    `,
  },
  {
    name: "create_family_invites_table",
    sql: `
      CREATE TABLE IF NOT EXISTS family_invites (
        id serial PRIMARY KEY,
        email text NOT NULL,
        token text NOT NULL UNIQUE,
        invited_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "create_team_settings_table",
    sql: `
      CREATE TABLE IF NOT EXISTS team_settings (
        id serial PRIMARY KEY,
        team_name text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- Ensure the singleton row (id=1) exists so reads never return null
      INSERT INTO team_settings (id, team_name)
      VALUES (1, '')
      ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "add_last_reminder_sent_at_to_households",
    sql: `
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;
    `,
  },
  {
    name: "add_short_name_to_team_settings",
    sql: `
      ALTER TABLE team_settings
        ADD COLUMN IF NOT EXISTS short_name text NOT NULL DEFAULT '';
    `,
  },
  {
    name: "add_archived_at_to_households",
    sql: `
      ALTER TABLE households
        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    `,
  },
  {
    name: "add_accepted_by_clerk_user_id_to_family_invites",
    sql: `
      ALTER TABLE family_invites
        ADD COLUMN IF NOT EXISTS accepted_by_clerk_user_id text;
    `,
  },
  {
    name: "make_family_invites_email_nullable",
    sql: `
      ALTER TABLE family_invites
        ALTER COLUMN email DROP NOT NULL;
    `,
  },
  {
    name: "add_household_id_to_family_invites",
    sql: `
      ALTER TABLE family_invites
        ADD COLUMN IF NOT EXISTS household_id integer REFERENCES households(id) ON DELETE CASCADE;
    `,
  },
  {
    name: "add_archived_at_to_broadcasts",
    sql: `
      ALTER TABLE broadcasts
        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    `,
  },
  {
    name: "create_document_consents_table",
    sql: `
      CREATE TABLE IF NOT EXISTS document_consents (
        id serial PRIMARY KEY,
        household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        clerk_user_id text NOT NULL,
        document_type document_type NOT NULL,
        document_version text NOT NULL,
        acceptance_text text NOT NULL,
        season_id integer REFERENCES seasons(id),
        ip_address text,
        user_agent text,
        accepted_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "add_season_id_to_document_consents",
    sql: `
      ALTER TABLE document_consents
        ADD COLUMN IF NOT EXISTS season_id integer REFERENCES seasons(id);
    `,
  },
  {
    // Immutable revision counter: incremented on every document content replacement
    // so consents remain tied to the exact content that was accepted, even if the
    // storage object path / external URL is later reused.
    name: "add_version_number_to_team_documents",
    sql: `
      ALTER TABLE team_documents
        ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
    `,
  },
  {
    // Records when a coach last manually triggered a "remind unsigned" blast so the
    // server can enforce the 24-hour cooldown between manual notification sends.
    name: "add_last_notified_at_to_team_documents",
    sql: `
      ALTER TABLE team_documents
        ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
    `,
  },
  {
    name: "create_rider_invites_table",
    sql: `
      CREATE TABLE IF NOT EXISTS rider_invites (
        id serial PRIMARY KEY,
        rider_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        invited_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "add_notification_preferences_locked_to_users",
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS notification_preferences_locked boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: "create_board_reactions_table",
    sql: `
      CREATE TABLE IF NOT EXISTS board_reactions (
        id serial PRIMARY KEY,
        thread_id integer REFERENCES board_threads(id) ON DELETE CASCADE,
        post_id integer REFERENCES board_posts(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT board_reactions_target_check
          CHECK ((thread_id IS NOT NULL) <> (post_id IS NOT NULL)),
        CONSTRAINT board_reactions_user_target_reaction_unique
          UNIQUE (user_id, thread_id, post_id, reaction)
      );
      CREATE INDEX IF NOT EXISTS board_reactions_thread_id_idx ON board_reactions(thread_id);
      CREATE INDEX IF NOT EXISTS board_reactions_post_id_idx ON board_reactions(post_id);
    `,
  },
  {
    name: "create_event_rsvp_email_batches_table",
    sql: `
      CREATE TABLE IF NOT EXISTS event_rsvp_email_batches (
        id serial PRIMARY KEY,
        event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        recipient_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        due_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        locked_at timestamptz,
        sent_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT event_rsvp_email_batches_event_recipient_unique
          UNIQUE (event_id, recipient_user_id)
      );
      CREATE INDEX IF NOT EXISTS event_rsvp_email_batches_due_idx
        ON event_rsvp_email_batches(status, due_at);
    `,
  },
  {
    name: "create_household_admin_audit_table",
    sql: `
      CREATE TABLE IF NOT EXISTS household_admin_audit (
        id serial PRIMARY KEY,
        household_id integer REFERENCES households(id) ON DELETE SET NULL,
        member_id integer REFERENCES users(id) ON DELETE SET NULL,
        administrator_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        before jsonb NOT NULL,
        after jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS household_admin_audit_household_id_idx
        ON household_admin_audit(household_id);
      CREATE INDEX IF NOT EXISTS household_admin_audit_member_id_idx
        ON household_admin_audit(member_id);
    `,
  },
  {
    name: "enforce_one_carpool_claim_per_rider_event",
    sql: `
      ALTER TABLE carpool_claims
        ADD COLUMN IF NOT EXISTS event_id integer;

      UPDATE carpool_claims AS claim
      SET event_id = offer.event_id
      FROM carpool_offers AS offer
      WHERE claim.carpool_offer_id = offer.id
        AND claim.event_id IS DISTINCT FROM offer.event_id;

      WITH ranked_claims AS (
        SELECT
          claim.id,
          ROW_NUMBER() OVER (
            PARTITION BY claim.event_id, claim.rider_user_id
            ORDER BY
              CASE WHEN matched_request.id IS NOT NULL THEN 0 ELSE 1 END,
              claim.created_at,
              claim.id
          ) AS claim_rank
        FROM carpool_claims AS claim
        LEFT JOIN carpool_requests AS matched_request
          ON matched_request.event_id = claim.event_id
         AND matched_request.rider_user_id = claim.rider_user_id
         AND matched_request.matched_offer_id = claim.carpool_offer_id
         AND matched_request.status = 'matched'
      )
      DELETE FROM carpool_claims AS claim
      USING ranked_claims
      WHERE claim.id = ranked_claims.id
        AND ranked_claims.claim_rank > 1;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'carpool_claims_event_id_fk'
        ) THEN
          ALTER TABLE carpool_claims
            ADD CONSTRAINT carpool_claims_event_id_fk
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
        END IF;
      END $$;

      ALTER TABLE carpool_claims
        ALTER COLUMN event_id SET NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS carpool_claims_event_rider_unique_idx
        ON carpool_claims(event_id, rider_user_id);
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
