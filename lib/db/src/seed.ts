/**
 * TrailTeam seed script — run with: pnpm --filter @workspace/db run seed
 *
 * Populates the database with realistic example data for a mountain bike team.
 * Safe to re-run: uses ON CONFLICT DO NOTHING where possible.
 * WARNING: This truncates and re-inserts data. Do NOT run in production.
 */

import { db } from "./index";
import {
  householdsTable,
  usersTable,
  podsTable,
  trailheadsTable,
  eventsTable,
  eventRsvpsTable,
  carpoolOffersTable,
  carpoolClaimsTable,
  carpoolRequestsTable,
  broadcastsTable,
  inviteLinksTable,
} from "./schema";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  // ── Pods ─────────────────────────────────────────────────────────────────
  console.log("  → Pods");
  await db.execute(sql`
    INSERT INTO pods (name, description, color, season, is_active, created_at, updated_at)
    VALUES
      ('Coyotes',      'Beginner-friendly pod for newer riders',             '#22c55e', '2025-26', true, NOW(), NOW()),
      ('Ravens',       'Intermediate pod building race fitness',              '#f97316', '2025-26', true, NOW(), NOW()),
      ('Falcons',      'Advanced/elite riders chasing the podium',           '#6366f1', '2025-26', true, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);

  // ── Trailheads ───────────────────────────────────────────────────────────
  console.log("  → Trailheads");
  await db.execute(sql`
    INSERT INTO trailheads (name, address, google_maps_url, latitude, longitude, notes, created_at, updated_at)
    VALUES
      ('Annadel State Park',           'Channel Dr, Santa Rosa, CA 95409',         'https://maps.google.com/?q=Annadel+State+Park',          38.459, -122.617, 'Meet at Lake Ilsanjo trailhead. Arrive 15 min early.', NOW(), NOW()),
      ('Shiloh Ranch Regional Park',   '4285 Shiloh Ranch Regional Park, Windsor', 'https://maps.google.com/?q=Shiloh+Ranch+Regional+Park',  38.565, -122.782, 'Good intermediate trails. Lower parking lot.', NOW(), NOW()),
      ('Spring Lake Regional Park',    '5585 Newanga Ave, Santa Rosa, CA 95403',   'https://maps.google.com/?q=Spring+Lake+Regional+Park',   38.452, -122.673, 'Pump track near main entrance.', NOW(), NOW()),
      ('Boggs Mountain State Forest',  'Lakeport, CA 95453',                       'https://maps.google.com/?q=Boggs+Mountain+State+Forest', 38.850, -122.770, 'Race venue. Pit area near main parking.', NOW(), NOW()),
      ('Jack London State Historic Park','2400 London Ranch Rd, Glen Ellen CA',    'https://maps.google.com/?q=Jack+London+State+Park',      38.355, -122.524, 'Meet at upper parking lot.', NOW(), NOW()),
      ('Skyline Wilderness Park',      '2201 Imola Ave, Napa, CA 94559',           'https://maps.google.com/?q=Skyline+Wilderness+Park+Napa',38.278, -122.281, 'Good pump track. Park on Imola Ave.', NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);

  // ── Households ───────────────────────────────────────────────────────────
  console.log("  → Households");
  await db.execute(sql`
    INSERT INTO households (name, invite_code, pod_id, address,
      emergency_contact_name, emergency_contact_phone,
      liability_waiver_signed, liability_waiver_signed_at,
      media_release_signed, media_release_signed_at,
      code_of_conduct_signed, code_of_conduct_signed_at, created_at, updated_at)
    VALUES
      ('Perin Family',    '36054529c4fe', '1', '27 Ridgeline Way, Santa Rosa, CA 95401',
       'Suzanne Perin',   '(707) 555-0101',
       true, NOW()-INTERVAL '90 days', true, NOW()-INTERVAL '90 days', true, NOW()-INTERVAL '90 days',
       NOW()-INTERVAL '90 days', NOW()),
      ('Ramirez Family',  'a1b2c3d4e5f6', '1', '142 Oak Ridge Dr, Santa Rosa, CA 95401',
       'Carmen Ramirez',  '(707) 555-0181',
       true, NOW()-INTERVAL '45 days', true, NOW()-INTERVAL '45 days', true, NOW()-INTERVAL '45 days',
       NOW()-INTERVAL '45 days', NOW()),
      ('Johnson Family',  'b2c3d4e5f601', '2', '88 Creekside Ln, Sebastopol, CA 95472',
       'Mark Johnson',    '(707) 555-0247',
       true, NOW()-INTERVAL '30 days', true, NOW()-INTERVAL '30 days', true, NOW()-INTERVAL '30 days',
       NOW()-INTERVAL '30 days', NOW()),
      ('Chen Family',     'c3d4e5f60102', '2', '215 Vineyard View Ct, Windsor, CA 95492',
       'Wei Chen',        '(707) 555-0312',
       true, NOW()-INTERVAL '60 days', true, NOW()-INTERVAL '60 days', true, NOW()-INTERVAL '60 days',
       NOW()-INTERVAL '60 days', NOW()),
      ('Williams Family', 'd4e5f6010203', '3', '703 Redwood Hollow, Healdsburg, CA 95448',
       'Patricia Williams','(707) 555-0423',
       true, NOW()-INTERVAL '20 days', false, NULL, true, NOW()-INTERVAL '20 days',
       NOW()-INTERVAL '20 days', NOW()),
      ('Martinez Family', 'e5f601020304', '1', '31 Hillcrest Ave, Petaluma, CA 94952',
       'Rosa Martinez',   '(707) 555-0534',
       false, NULL, false, NULL, false, NULL,
       NOW()-INTERVAL '5 days', NOW())
    ON CONFLICT (invite_code) DO NOTHING
  `);

  // ── Users ────────────────────────────────────────────────────────────────
  console.log("  → Users");
  const notifPrefs = JSON.stringify({
    practiceReminders: true, coachMessages: true, carpoolUpdates: true, eventReminders: true, rosterUpdates: true
  });
  const noRiderPrefs = JSON.stringify({
    practiceReminders: true, coachMessages: true, carpoolUpdates: false, eventReminders: true, rosterUpdates: false
  });

  // Get household IDs dynamically
  const hh = await db.execute(sql`SELECT id, name FROM households ORDER BY id`);
  const hhMap: Record<string, number> = {};
  for (const row of hh.rows as any[]) hhMap[row.name] = row.id;

  // NOTE: clerkUserId is intentionally null for seed users.
  // Real users will link their Clerk account on first login.
  await db.execute(sql`
    INSERT INTO users (household_id, first_name, last_name, email, phone, role, pod_id,
      is_active, gender, grade, approved, notifications_enabled, email_notifications,
      sms_notifications, push_notifications, notification_preferences, created_at, updated_at)
    SELECT * FROM (VALUES
      -- Perin Family (coach household)
      (${hhMap['Perin Family']}, 'Noah',    'Perin',    'arknoah1@gmail.com',                     '(707) 555-0101', 'coach',   '1', true, 'male',   NULL, true, true, true, false, true,  ${notifPrefs}::jsonb, NOW()-INTERVAL '90 days', NOW()),
      (${hhMap['Perin Family']}, 'Suzanne', 'Perin',    'suznoahperin@gmail.com',                 '(707) 555-0102', 'parent',  '1', true, 'female', NULL, true, true, true, true,  true,  ${notifPrefs}::jsonb, NOW()-INTERVAL '90 days', NOW()),
      (${hhMap['Perin Family']}, 'Sophia',  'Perin',    'rider-f7137299ab11@trailtribe.internal',  NULL,             'student', '2', true, 'female', 10,   true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '90 days', NOW()),
      (${hhMap['Perin Family']}, 'Rebekah', 'Perin',    'rider-32ba1ef372e8@trailtribe.internal',  NULL,             'student', '3', true, 'female', 8,    true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '90 days', NOW()),
      -- Ramirez Family
      (${hhMap['Ramirez Family']}, 'Diego',  'Ramirez', 'diego.ramirez@email.com',  '(707) 555-0181', 'parent',  '1', true, 'male',   NULL, true, true, true, false, true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '45 days', NOW()),
      (${hhMap['Ramirez Family']}, 'Carmen', 'Ramirez', 'carmen.ramirez@email.com', '(707) 555-0182', 'parent',  '1', true, 'female', NULL, true, true, true, true,  true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '45 days', NOW()),
      (${hhMap['Ramirez Family']}, 'Lucas',  'Ramirez', 'rider-lucas-ramirez@trailtribe.internal', NULL, 'student', '1', true, 'male', 9, true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '45 days', NOW()),
      -- Johnson Family
      (${hhMap['Johnson Family']}, 'Dave',  'Johnson',  'dave.johnson@email.com',  '(707) 555-0241', 'parent',  '2', true, 'male',   NULL, true, true, true, true,  true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '30 days', NOW()),
      (${hhMap['Johnson Family']}, 'Lisa',  'Johnson',  'lisa.johnson@email.com',  '(707) 555-0242', 'parent',  '2', true, 'female', NULL, true, true, true, false, true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '30 days', NOW()),
      (${hhMap['Johnson Family']}, 'Mia',   'Johnson',  'rider-mia-johnson@trailtribe.internal',   NULL, 'student', '2', true, 'female', 10, true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '30 days', NOW()),
      (${hhMap['Johnson Family']}, 'Tyler', 'Johnson',  'rider-tyler-johnson@trailtribe.internal',  NULL, 'student', '2', true, 'male',    8, true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '30 days', NOW()),
      -- Chen Family
      (${hhMap['Chen Family']}, 'Wei',  'Chen', 'wei.chen@email.com',  '(707) 555-0311', 'parent',  '2', true, 'male',   NULL, true, true, true, false, true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '60 days', NOW()),
      (${hhMap['Chen Family']}, 'Amy',  'Chen', 'amy.chen@email.com',  '(707) 555-0312', 'parent',  '2', true, 'female', NULL, true, true, true, true,  true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '60 days', NOW()),
      (${hhMap['Chen Family']}, 'Jake', 'Chen', 'rider-jake-chen@trailtribe.internal', NULL, 'student', '2', true, 'male', 11, true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '60 days', NOW()),
      -- Williams Family
      (${hhMap['Williams Family']}, 'Marcus', 'Williams', 'marcus.williams@email.com', '(707) 555-0421', 'parent',  '3', true, 'male',   NULL, true, true, true, false, true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '20 days', NOW()),
      (${hhMap['Williams Family']}, 'Tanya',  'Williams', 'tanya.williams@email.com',  '(707) 555-0422', 'parent',  '3', true, 'female', NULL, true, true, true, true,  true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '20 days', NOW()),
      (${hhMap['Williams Family']}, 'Zoe',    'Williams', 'rider-zoe-williams@trailtribe.internal', NULL, 'student', '3', true, 'female', 10, true, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '20 days', NOW()),
      -- Martinez Family (pending approval)
      (${hhMap['Martinez Family']}, 'Carlos', 'Martinez', 'carlos.martinez@email.com',                   '(707) 555-0531', 'parent',  '1', true, 'male', NULL, false, true, true, false, true,  ${notifPrefs}::jsonb,   NOW()-INTERVAL '5 days', NOW()),
      (${hhMap['Martinez Family']}, 'Javier', 'Martinez', 'rider-javier-martinez@trailtribe.internal',    NULL,             'student', '1', true, 'male', 9,    false, true, true, false, false, ${noRiderPrefs}::jsonb, NOW()-INTERVAL '5 days', NOW())
    ) AS v(household_id, first_name, last_name, email, phone, role, pod_id,
           is_active, gender, grade, approved, notifications_enabled, email_notifications,
           sms_notifications, push_notifications, notification_preferences, created_at, updated_at)
    ON CONFLICT (email) DO NOTHING
  `);

  console.log("✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
