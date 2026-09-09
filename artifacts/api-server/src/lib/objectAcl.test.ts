import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return {
    client,
    pool: {
      connect: vi.fn(async () => client),
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: {},
  pool: mocks.pool,
  usersTable: {},
}));

import {
  cleanupAbandonedDiscussionImageAcls,
  DISCUSSION_IMAGE_CLEANUP_GRACE_MS,
} from "./objectAcl";

const ABANDONED_PATH = "/objects/discussion-images/abandoned-image";

function configureDatabase(candidates: string[]) {
  mocks.client.query.mockImplementation(async (query: string) => {
    if (query.includes("SELECT acl.object_path")) {
      return {
        rows: candidates.map((objectPath) => ({ object_path: objectPath })),
        rowCount: candidates.length,
      };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("cleanupAbandonedDiscussionImageAcls", () => {
  beforeEach(() => {
    mocks.client.query.mockReset();
    mocks.client.release.mockReset();
    mocks.pool.connect.mockClear();
  });

  it("deletes stale unattached objects and their ACL reservations", async () => {
    configureDatabase([ABANDONED_PATH]);
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    const result = await cleanupAbandonedDiscussionImageAcls(deleteObject, {
      now: new Date("2026-09-10T00:00:00.000Z"),
    });

    expect(result).toEqual({ deletedCount: 1, failedCount: 0 });
    expect(deleteObject).toHaveBeenCalledWith(ABANDONED_PATH);
    expect(mocks.client.query).toHaveBeenCalledWith(
      "DELETE FROM object_acl_policies WHERE object_path = $1",
      [ABANDONED_PATH],
    );
    expect(mocks.client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("keeps a failed reservation so a later run can retry it", async () => {
    configureDatabase([ABANDONED_PATH]);
    const deleteObject = vi.fn().mockRejectedValue(new Error("object store unavailable"));

    const result = await cleanupAbandonedDiscussionImageAcls(deleteObject, {
      gracePeriodMs: DISCUSSION_IMAGE_CLEANUP_GRACE_MS,
    });

    expect(result).toEqual({ deletedCount: 0, failedCount: 1 });
    expect(mocks.client.query).not.toHaveBeenCalledWith(
      "DELETE FROM object_acl_policies WHERE object_path = $1",
      [ABANDONED_PATH],
    );
    expect(mocks.client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("is a no-op when the next run finds no stale reservations", async () => {
    let pending = true;
    mocks.client.query.mockImplementation(async (query: string) => {
      if (query.includes("SELECT acl.object_path")) {
        const rows = pending ? [{ object_path: ABANDONED_PATH }] : [];
        return { rows, rowCount: rows.length };
      }
      if (query.startsWith("DELETE FROM object_acl_policies")) {
        pending = false;
      }
      return { rows: [], rowCount: 0 };
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    await cleanupAbandonedDiscussionImageAcls(deleteObject);
    const secondResult = await cleanupAbandonedDiscussionImageAcls(deleteObject);

    expect(secondResult).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });
});