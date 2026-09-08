import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { runMigrations } from "./migrate";

describe("event audience database constraint", () => {
  const createdUids: string[] = [];

  beforeAll(async () => {
    // Startup migrations are deliberately replayable. Running twice verifies
    // the audience repair and named constraint are safe after first install.
    await runMigrations();
    await runMigrations();
  });

  afterAll(async () => {
    if (createdUids.length > 0) {
      await pool.query("DELETE FROM events WHERE ical_uid = ANY($1::text[])", [createdUids]);
    }
  });

  async function writeAudience(isAllTeam: boolean, podIds: string[] | null) {
    const uid = `audience-constraint-${process.pid}-${Date.now()}-${createdUids.length}`;
    createdUids.push(uid);
    return pool.query(
      `INSERT INTO events (title, start_time, ical_uid, is_all_team, pod_ids)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING is_all_team, pod_ids`,
      ["Audience constraint test", new Date("2026-09-10T17:00:00.000Z"), uid, isAllTeam, podIds],
    );
  }

  it("keeps valid team-wide events writable", async () => {
    const result = await writeAudience(true, null);
    expect(result.rows[0]).toEqual({ is_all_team: true, pod_ids: null });
  });

  it("keeps valid pod events writable", async () => {
    const result = await writeAudience(false, ["pod-a", "pod-b"]);
    expect(result.rows[0]).toEqual({
      is_all_team: false,
      pod_ids: ["pod-a", "pod-b"],
    });
  });

  it("rejects conflicting audiences from direct database writers", async () => {
    await expect(writeAudience(true, ["pod-a"])).rejects.toMatchObject({
      constraint: "events_audience_not_conflicting_check",
    });
  });
});