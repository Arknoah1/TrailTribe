import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pageSource = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), "messages.tsx"),
  "utf8",
);

test("Community Board filters the current thread scope by unread activity", () => {
  assert.match(pageSource, /data-testid="board-unread-filter"/);
  assert.match(pageSource, /aria-pressed=\{showUnreadOnly\}/);
  assert.match(pageSource, /sortedThreads\.filter\(thread => unreadThreadIds\?\.includes\(thread\.id\)\)/);
  assert.match(pageSource, /showUnreadOnly\s*\?\s*"No unread threads\."/);
  assert.match(pageSource, /<Badge[^>]*>\s*Unread\s*<\/Badge>/);
  assert.match(pageSource, /setUnreadThreadIds\(unreadData\.threadIds\)/);
  assert.match(pageSource, /setUnreadThreadIds\(unreadData\.threadIds\)[\s\S]*markSeenMutateRef\.current\(undefined\)/);
  assert.match(pageSource, /<ThreadsList scope="general"[^>]+showUnreadOnly=\{showUnreadOnly\}/);
  assert.match(pageSource, /<ThreadsList scope="pod"[^>]+showUnreadOnly=\{showUnreadOnly\}/);
  assert.match(pageSource, /<ThreadsList scope="event"[^>]+showUnreadOnly=\{showUnreadOnly\}/);
});
